-- Owner-controlled scheduled sessions layered onto the universal booking engine.

alter table public.services
  add column if not exists scheduling_mode text not null default 'generated'
    check (scheduling_mode in ('generated', 'scheduled'));

create table if not exists public.scheduled_sessions (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete restrict,
  staff_id bigint not null references public.staff_members(id) on delete restrict,
  resource_id bigint references public.resources(id) on delete restrict,
  series_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_starts_at timestamptz not null,
  occupied_ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  is_published boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (occupied_ends_at > occupied_starts_at)
);

alter table public.scheduled_sessions drop constraint if exists scheduled_sessions_prevent_staff_overlap;
alter table public.scheduled_sessions
  add constraint scheduled_sessions_prevent_staff_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(occupied_starts_at, occupied_ends_at, '[)') with &&
  ) where (status = 'scheduled');

alter table public.bookings
  add column if not exists scheduled_session_id bigint
    references public.scheduled_sessions(id) on delete restrict;

create index if not exists scheduled_sessions_business_start_idx
  on public.scheduled_sessions (business_id, starts_at)
  where status = 'scheduled';
create index if not exists scheduled_sessions_service_start_idx
  on public.scheduled_sessions (service_id, starts_at)
  where status = 'scheduled' and is_published;
create index if not exists scheduled_sessions_staff_start_idx
  on public.scheduled_sessions (staff_id, starts_at)
  where status = 'scheduled';
create index if not exists scheduled_sessions_resource_idx
  on public.scheduled_sessions (resource_id)
  where resource_id is not null and status = 'scheduled';
create index if not exists bookings_scheduled_session_idx
  on public.bookings (scheduled_session_id)
  where scheduled_session_id is not null and status in ('pending', 'confirmed');

alter table public.scheduled_sessions enable row level security;

create policy "scheduled_sessions_public_read"
  on public.scheduled_sessions for select to anon
  using (status = 'scheduled' and is_published and starts_at > now());
create policy "scheduled_sessions_member_read"
  on public.scheduled_sessions for select to authenticated
  using ((select private.has_business_role(business_id)));

grant select on public.scheduled_sessions to anon, authenticated;
grant usage, select on sequence public.scheduled_sessions_id_seq to authenticated;

create or replace function public.create_scheduled_sessions(
  p_business_id bigint,
  p_service_id bigint,
  p_staff_id bigint,
  p_local_starts_at timestamp,
  p_duration_minutes integer,
  p_capacity integer,
  p_repeat_weeks integer default 1,
  p_is_published boolean default true,
  p_notes text default null
)
returns table (series_id uuid, sessions_created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_buffer_before integer;
  v_buffer_after integer;
  v_series_id uuid := gen_random_uuid();
  v_index integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not (select private.has_business_role(p_business_id, array['owner', 'manager'])) then
    raise exception 'Only owners and managers can schedule sessions' using errcode = '42501';
  end if;
  if p_duration_minutes < 5 or p_capacity < 1 or p_repeat_weeks not between 1 and 52 then
    raise exception 'Invalid duration, capacity or repeat count' using errcode = '22023';
  end if;

  select sm.timezone, s.buffer_before_minutes, s.buffer_after_minutes
  into v_timezone, v_buffer_before, v_buffer_after
  from public.services s
  join public.staff_services ss on ss.service_id = s.id and ss.staff_id = p_staff_id and ss.is_active
  join public.staff_members sm on sm.id = ss.staff_id and sm.business_id = s.business_id and sm.is_active
  where s.id = p_service_id and s.business_id = p_business_id
    and s.is_active and s.scheduling_mode = 'scheduled';

  if v_timezone is null then
    raise exception 'The selected staff member is not assigned to this scheduled service' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_staff_id);

  for v_index in 0..p_repeat_weeks - 1 loop
    v_start := (p_local_starts_at + make_interval(weeks => v_index)) at time zone v_timezone;
    v_end := v_start + make_interval(mins => p_duration_minutes);

    if exists (
      select 1 from public.bookings booking
      where booking.staff_id = p_staff_id
        and booking.status in ('pending', 'confirmed')
        and tstzrange(booking.occupied_starts_at, booking.occupied_ends_at, '[)') &&
          tstzrange(v_start - make_interval(mins => v_buffer_before),
                    v_end + make_interval(mins => v_buffer_after), '[)')
    ) then
      raise exception 'The staff member already has a booking during one of these times' using errcode = '23P01';
    end if;

    if exists (
      select 1 from public.availability_exceptions exception
      where exception.staff_id = p_staff_id
        and exception.exception_type = 'unavailable'
        and (exception.service_id is null or exception.service_id = p_service_id)
        and tstzrange(exception.starts_at, exception.ends_at, '[)') &&
          tstzrange(v_start - make_interval(mins => v_buffer_before),
                    v_end + make_interval(mins => v_buffer_after), '[)')
    ) then
      raise exception 'The staff member is marked unavailable during one of these times' using errcode = '23P01';
    end if;

    insert into public.scheduled_sessions (
      business_id, service_id, staff_id, series_id, starts_at, ends_at,
      occupied_starts_at, occupied_ends_at, capacity, is_published, notes, created_by
    ) values (
      p_business_id, p_service_id, p_staff_id, v_series_id, v_start, v_end,
      v_start - make_interval(mins => v_buffer_before),
      v_end + make_interval(mins => v_buffer_after),
      p_capacity, p_is_published, nullif(left(btrim(p_notes), 1000), ''), (select auth.uid())
    );
  end loop;

  return query select v_series_id, p_repeat_weeks;
exception when exclusion_violation then
  raise exception 'The staff member already has a scheduled session during one of these times' using errcode = '23P01';
end;
$$;

create or replace function public.cancel_scheduled_session(p_session_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
begin
  select business_id into v_business_id
  from public.scheduled_sessions where id = p_session_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id, array['owner', 'manager'])) then
    raise exception 'Session not found or access denied' using errcode = '42501';
  end if;
  update public.scheduled_sessions
  set status = 'cancelled', is_published = false, updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function public.get_public_scheduled_sessions(
  p_business_slug text,
  p_service_slug text,
  p_from_date date,
  p_to_date date
)
returns table (
  session_id bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  staff_slug text,
  staff_name text,
  staff_timezone text,
  capacity integer,
  remaining_capacity integer,
  notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select session.id, session.starts_at, session.ends_at,
    staff.slug, staff.display_name, staff.timezone, session.capacity,
    greatest(session.capacity - coalesce(sum(booking.quantity) filter (
      where booking.status in ('pending', 'confirmed')
    ), 0)::integer, 0),
    session.notes
  from public.scheduled_sessions session
  join public.businesses business on business.id = session.business_id
  join public.services service on service.id = session.service_id
  join public.staff_members staff on staff.id = session.staff_id
  left join public.bookings booking on booking.scheduled_session_id = session.id
  where lower(business.business_slug) = lower(p_business_slug)
    and lower(service.slug) = lower(p_service_slug)
    and service.scheduling_mode = 'scheduled'
    and service.is_active and service.is_published
    and staff.is_active and staff.is_published
    and session.status = 'scheduled' and session.is_published
    and session.starts_at >= p_from_date::timestamp at time zone staff.timezone
    and session.starts_at < (p_to_date + 1)::timestamp at time zone staff.timezone
    and session.starts_at > now()
  group by session.id, staff.id
  having session.capacity - coalesce(sum(booking.quantity) filter (
    where booking.status in ('pending', 'confirmed')
  ), 0) > 0
  order by session.starts_at, staff.display_name;
$$;

create or replace function public.create_public_session_booking(
  p_business_slug text,
  p_service_slug text,
  p_session_id bigint,
  p_customer_name text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_notes text default null,
  p_quantity integer default 1
)
returns table (booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.scheduled_sessions%rowtype;
  v_reserved integer;
  v_reference text;
  v_id uuid;
begin
  if nullif(btrim(p_customer_name), '') is null or p_quantity < 1 then
    raise exception 'Customer name and a valid quantity are required' using errcode = '22023';
  end if;

  select session.* into v_session
  from public.scheduled_sessions session
  join public.businesses business on business.id = session.business_id
  join public.services service on service.id = session.service_id
  where session.id = p_session_id
    and lower(business.business_slug) = lower(p_business_slug)
    and lower(service.slug) = lower(p_service_slug)
    and service.scheduling_mode = 'scheduled'
    and service.is_active and service.is_published
    and session.status = 'scheduled' and session.is_published
    and session.starts_at > now()
  for update of session;

  if v_session.id is null then
    raise exception 'This session is no longer available' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity), 0)::integer into v_reserved
  from public.bookings
  where scheduled_session_id = v_session.id and status in ('pending', 'confirmed');

  if v_reserved + p_quantity > v_session.capacity then
    raise exception 'This session no longer has enough places' using errcode = '23P01';
  end if;

  v_reference := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.bookings (
    business_id, service_id, staff_id, scheduled_session_id,
    customer_name, customer_email, customer_phone, starts_at, ends_at,
    quantity, buffer_before_minutes, buffer_after_minutes,
    occupied_starts_at, occupied_ends_at, reference, notes
  ) values (
    v_session.business_id, v_session.service_id, null, v_session.id,
    left(btrim(p_customer_name), 200), nullif(left(btrim(p_customer_email), 320), ''),
    nullif(left(btrim(p_customer_phone), 50), ''), v_session.starts_at, v_session.ends_at,
    p_quantity, 0, 0, v_session.starts_at, v_session.ends_at, v_reference,
    nullif(left(btrim(p_notes), 2000), '')
  ) returning id into v_id;

  return query select v_id, v_reference, v_session.starts_at, v_session.ends_at;
end;
$$;

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
      and s.scheduling_mode = 'generated'
      and s.is_active and s.is_published and sm.is_active and sm.is_published
  ),
  rule_mode as (
    select x.*,
      exists (
        select 1 from public.availability_rules ar
        where ar.staff_id = x.staff_id and ar.service_id = x.service_id
          and ar.day_of_week = extract(dow from p_local_date)::int and ar.is_active
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
    join public.availability_rules ar on ar.staff_id = r.staff_id
      and ar.day_of_week = extract(dow from p_local_date)::int and ar.is_active
      and (ar.valid_from is null or ar.valid_from <= p_local_date)
      and (ar.valid_until is null or ar.valid_until >= p_local_date)
      and ((r.has_specific and ar.service_id = r.service_id) or (not r.has_specific and ar.service_id is null))
    union all
    select r.*,
      greatest(ae.starts_at, p_local_date::timestamp at time zone r.timezone),
      least(ae.ends_at, (p_local_date + 1)::timestamp at time zone r.timezone)
    from rule_mode r
    join public.availability_exceptions ae on ae.staff_id = r.staff_id
      and ae.exception_type = 'available'
      and (ae.service_id is null or ae.service_id = r.service_id)
      and ae.starts_at < (p_local_date + 1)::timestamp at time zone r.timezone
      and ae.ends_at > p_local_date::timestamp at time zone r.timezone
  ),
  candidates as (
    select w.*, gs starts_at, gs + make_interval(mins => w.duration_minutes) ends_at
    from windows w
    cross join lateral generate_series(
      w.window_start,
      w.window_end - make_interval(mins => w.duration_minutes),
      make_interval(mins => w.slot_interval_minutes)
    ) gs
  )
  select distinct c.starts_at, c.ends_at, (c.starts_at at time zone c.timezone)::time local_time
  from candidates c
  where c.starts_at > now()
    and not exists (
      select 1 from public.availability_exceptions ae
      where ae.staff_id = c.staff_id and ae.exception_type = 'unavailable'
        and (ae.service_id is null or ae.service_id = c.service_id)
        and tstzrange(ae.starts_at, ae.ends_at, '[)') && tstzrange(
          c.starts_at - make_interval(mins => c.buffer_before_minutes),
          c.ends_at + make_interval(mins => c.buffer_after_minutes), '[)')
    )
    and not exists (
      select 1 from public.bookings bk
      where bk.staff_id = c.staff_id and bk.status in ('pending', 'confirmed')
        and tstzrange(bk.occupied_starts_at, bk.occupied_ends_at, '[)') && tstzrange(
          c.starts_at - make_interval(mins => c.buffer_before_minutes),
          c.ends_at + make_interval(mins => c.buffer_after_minutes), '[)')
    )
    and not exists (
      select 1 from public.scheduled_sessions session
      where session.staff_id = c.staff_id and session.status = 'scheduled'
        and tstzrange(session.occupied_starts_at, session.occupied_ends_at, '[)') && tstzrange(
          c.starts_at - make_interval(mins => c.buffer_before_minutes),
          c.ends_at + make_interval(mins => c.buffer_after_minutes), '[)')
    )
  order by starts_at;
$$;

revoke all on function public.create_scheduled_sessions(bigint,bigint,bigint,timestamp,integer,integer,integer,boolean,text) from public;
revoke all on function public.cancel_scheduled_session(bigint) from public;
revoke all on function public.get_public_scheduled_sessions(text,text,date,date) from public;
revoke all on function public.create_public_session_booking(text,text,bigint,text,text,text,text,integer) from public;
grant execute on function public.create_scheduled_sessions(bigint,bigint,bigint,timestamp,integer,integer,integer,boolean,text) to authenticated;
grant execute on function public.cancel_scheduled_session(bigint) to authenticated;
grant execute on function public.get_public_scheduled_sessions(text,text,date,date) to anon, authenticated;
grant execute on function public.create_public_session_booking(text,text,bigint,text,text,text,text,integer) to anon, authenticated;

comment on table public.scheduled_sessions is
  'Owner-published class, course or appointment occurrences. Customer bookings reference an occurrence for capacity.';
