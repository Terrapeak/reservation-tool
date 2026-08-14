-- Public availability and concurrency-safe booking API.

alter table public.bookings
  add column if not exists buffer_before_minutes integer not null default 0
    check (buffer_before_minutes >= 0),
  add column if not exists buffer_after_minutes integer not null default 0
    check (buffer_after_minutes >= 0),
  add column if not exists occupied_starts_at timestamptz,
  add column if not exists occupied_ends_at timestamptz;

update public.bookings
set occupied_starts_at = starts_at - make_interval(mins => buffer_before_minutes),
    occupied_ends_at = ends_at + make_interval(mins => buffer_after_minutes)
where occupied_starts_at is null or occupied_ends_at is null;

alter table public.bookings
  alter column occupied_starts_at set not null,
  alter column occupied_ends_at set not null;

alter table public.bookings drop constraint if exists bookings_prevent_staff_overlap;
alter table public.bookings
  add constraint bookings_prevent_staff_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(occupied_starts_at, occupied_ends_at, '[)') with &&
  ) where (staff_id is not null and status in ('pending', 'confirmed'));

create or replace function public.get_available_slots(
  p_business_slug text,
  p_service_slug text,
  p_staff_slug text,
  p_local_date date
)
returns table (starts_at timestamptz, ends_at timestamptz, local_time time)
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select b.id business_id, s.id service_id, sm.id staff_id, sm.timezone,
      coalesce(ss.custom_duration_minutes, s.duration_minutes) duration_minutes,
      s.slot_interval_minutes, s.buffer_before_minutes, s.buffer_after_minutes
    from public.businesses b
    join public.services s on s.business_id = b.id
    join public.staff_services ss on ss.service_id = s.id and ss.is_active
    join public.staff_members sm on sm.id = ss.staff_id and sm.business_id = b.id
    where lower(b.business_slug) = lower(p_business_slug)
      and lower(s.slug) = lower(p_service_slug)
      and lower(sm.slug) = lower(p_staff_slug)
      and s.is_active and s.is_published and sm.is_active and sm.is_published
  ),
  rule_mode as (
    select x.*,
      exists (
        select 1 from public.availability_rules ar
        where ar.staff_id=x.staff_id and ar.service_id=x.service_id
          and ar.day_of_week=extract(dow from p_local_date)::int and ar.is_active
          and (ar.valid_from is null or ar.valid_from <= p_local_date)
          and (ar.valid_until is null or ar.valid_until >= p_local_date)
      ) has_specific
    from selected x
  ),
  windows as (
    select r.*,
      (p_local_date + ar.start_time) at time zone r.timezone window_start,
      (p_local_date + ar.end_time) at time zone r.timezone window_end
    from rule_mode r
    join public.availability_rules ar on ar.staff_id=r.staff_id
      and ar.day_of_week=extract(dow from p_local_date)::int and ar.is_active
      and (ar.valid_from is null or ar.valid_from <= p_local_date)
      and (ar.valid_until is null or ar.valid_until >= p_local_date)
      and ((r.has_specific and ar.service_id=r.service_id) or (not r.has_specific and ar.service_id is null))
    union all
    select r.*,
      greatest(ae.starts_at, p_local_date::timestamp at time zone r.timezone),
      least(ae.ends_at, (p_local_date + 1)::timestamp at time zone r.timezone)
    from rule_mode r
    join public.availability_exceptions ae on ae.staff_id=r.staff_id
      and ae.exception_type='available'
      and (ae.service_id is null or ae.service_id=r.service_id)
      and ae.starts_at < (p_local_date + 1)::timestamp at time zone r.timezone
      and ae.ends_at > p_local_date::timestamp at time zone r.timezone
  ),
  candidates as (
    select w.*,
      gs starts_at,
      gs + make_interval(mins=>w.duration_minutes) ends_at
    from windows w
    cross join lateral generate_series(
      w.window_start,
      w.window_end - make_interval(mins=>w.duration_minutes),
      make_interval(mins=>w.slot_interval_minutes)
    ) gs
  )
  select distinct c.starts_at, c.ends_at, (c.starts_at at time zone c.timezone)::time local_time
  from candidates c
  where c.starts_at > now()
    and not exists (
      select 1 from public.availability_exceptions ae
      where ae.staff_id=c.staff_id and ae.exception_type='unavailable'
        and (ae.service_id is null or ae.service_id=c.service_id)
        and tstzrange(ae.starts_at, ae.ends_at, '[)') && tstzrange(
          c.starts_at - make_interval(mins=>c.buffer_before_minutes),
          c.ends_at + make_interval(mins=>c.buffer_after_minutes), '[)')
    )
    and not exists (
      select 1 from public.bookings bk
      where bk.staff_id=c.staff_id and bk.status in ('pending','confirmed')
        and tstzrange(bk.occupied_starts_at, bk.occupied_ends_at, '[)')
        && tstzrange(
          c.starts_at - make_interval(mins=>c.buffer_before_minutes),
          c.ends_at + make_interval(mins=>c.buffer_after_minutes), '[)')
    )
  order by starts_at;
$$;

create or replace function public.create_public_booking(
  p_business_slug text,
  p_service_slug text,
  p_staff_slug text,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns table (booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
  v_service_id bigint;
  v_staff_id bigint;
  v_duration integer;
  v_before integer;
  v_after integer;
  v_end timestamptz;
  v_reference text;
  v_id uuid;
  v_timezone text;
begin
  if nullif(btrim(p_customer_name), '') is null then
    raise exception 'Customer name is required' using errcode='22023';
  end if;

  select b.id, s.id, sm.id, coalesce(ss.custom_duration_minutes,s.duration_minutes),
    s.buffer_before_minutes, s.buffer_after_minutes, sm.timezone
  into v_business_id, v_service_id, v_staff_id, v_duration, v_before, v_after, v_timezone
  from public.businesses b
  join public.services s on s.business_id=b.id
  join public.staff_services ss on ss.service_id=s.id and ss.is_active
  join public.staff_members sm on sm.id=ss.staff_id and sm.business_id=b.id
  where lower(b.business_slug)=lower(p_business_slug)
    and lower(s.slug)=lower(p_service_slug) and lower(sm.slug)=lower(p_staff_slug)
    and s.is_active and s.is_published and sm.is_active and sm.is_published;

  if v_staff_id is null then raise exception 'Service or staff member not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(v_staff_id);

  if not exists (
    select 1 from public.get_available_slots(
      p_business_slug, p_service_slug, p_staff_slug,
      (p_starts_at at time zone v_timezone)::date
    ) slot where slot.starts_at=p_starts_at
  ) then
    raise exception 'This time is no longer available' using errcode='23P01';
  end if;

  v_end := p_starts_at + make_interval(mins=>v_duration);
  v_reference := 'BK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.bookings (
    business_id, service_id, staff_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
    occupied_starts_at, occupied_ends_at, reference, notes
  ) values (
    v_business_id, v_service_id, v_staff_id, left(btrim(p_customer_name),200),
    nullif(left(btrim(p_customer_email),320),''), nullif(left(btrim(p_customer_phone),50),''),
    p_starts_at, v_end, v_before, v_after,
    p_starts_at - make_interval(mins=>v_before), v_end + make_interval(mins=>v_after),
    v_reference, nullif(left(btrim(p_notes),2000),'')
  ) returning id into v_id;
  return query select v_id, v_reference, p_starts_at, v_end;
exception when exclusion_violation then
  raise exception 'This time is no longer available' using errcode='23P01';
end;
$$;

revoke all on function public.get_available_slots(text,text,text,date) from public;
revoke all on function public.create_public_booking(text,text,text,timestamptz,text,text,text,text) from public;
grant execute on function public.get_available_slots(text,text,text,date) to anon, authenticated;
grant execute on function public.create_public_booking(text,text,text,timestamptz,text,text,text,text) to anon, authenticated;

comment on function public.get_available_slots(text,text,text,date) is
  'Returns public slots while respecting staff-wide bookings, buffers, recurring rules and exceptions.';
comment on function public.create_public_booking(text,text,text,timestamptz,text,text,text,text) is
  'Creates a public booking atomically after server-side availability validation.';
