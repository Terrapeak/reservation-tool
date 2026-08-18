-- Cohort classes: atomic service/timetable creation, continuing enrolments and
-- rolling materialisation of open-ended class occurrences.

create extension if not exists pg_cron;

alter table public.services
  add column if not exists enrollment_mode text not null default 'session',
  add column if not exists cohort_start_date date,
  add column if not exists cohort_end_date date,
  add column if not exists schedule_open_ended boolean not null default false,
  add column if not exists enrollment_closed boolean not null default false;

alter table public.services
  drop constraint if exists services_enrollment_mode_check,
  add constraint services_enrollment_mode_check check (enrollment_mode in ('session', 'cohort')),
  drop constraint if exists services_cohort_dates_check,
  add constraint services_cohort_dates_check check (
    cohort_end_date is null or cohort_start_date is null or cohort_end_date >= cohort_start_date
  );

create table if not exists public.service_schedule_patterns (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete cascade,
  staff_id bigint not null references public.staff_members(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (service_id, day_of_week, starts_at)
);

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete restrict,
  reference text not null unique,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  quantity integer not null default 1 check (quantity > 0),
  joins_on date not null default current_date,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_enrollments_service_status_idx
  on public.class_enrollments (service_id, status)
  where status in ('pending', 'confirmed');
create index if not exists class_enrollments_business_created_idx
  on public.class_enrollments (business_id, created_at desc);
create index if not exists service_schedule_patterns_service_idx
  on public.service_schedule_patterns (service_id, day_of_week)
  where is_active;

alter table public.service_schedule_patterns enable row level security;
alter table public.class_enrollments enable row level security;

create policy "schedule_patterns_member_read" on public.service_schedule_patterns
  for select to authenticated using ((select private.has_business_role(business_id)));
create policy "schedule_patterns_manager_manage" on public.service_schedule_patterns
  for all to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "class_enrollments_member_read" on public.class_enrollments
  for select to authenticated using ((select private.has_business_role(business_id)));
create policy "class_enrollments_manager_manage" on public.class_enrollments
  for all to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));

grant select, insert, update, delete on public.service_schedule_patterns to authenticated;
grant select, insert, update, delete on public.class_enrollments to authenticated;

create or replace function private.materialize_cohort_sessions(
  p_service_id bigint,
  p_until date,
  p_strict boolean default false
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
  v_pattern public.service_schedule_patterns%rowtype;
  v_staff public.staff_members%rowtype;
  v_date date;
  v_limit date;
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_created integer := 0;
begin
  select * into v_service from public.services where id = p_service_id;
  if v_service.id is null or v_service.enrollment_mode <> 'cohort' then return 0; end if;
  v_limit := least(p_until, coalesce(v_service.cohort_end_date, p_until));
  if v_service.cohort_start_date is null or v_limit < v_service.cohort_start_date then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(42001, p_service_id::integer);

  for v_pattern in select * from public.service_schedule_patterns where service_id = p_service_id and is_active loop
    select * into v_staff from public.staff_members where id = v_pattern.staff_id and is_active;
    if v_staff.id is null then
      if p_strict then raise exception 'A selected teacher is not active' using errcode = '22023'; end if;
      continue;
    end if;
    v_date := v_service.cohort_start_date + ((v_pattern.day_of_week - extract(dow from v_service.cohort_start_date)::integer + 7) % 7);
    v_duration := extract(epoch from (v_pattern.ends_at - v_pattern.starts_at))::integer / 60;
    while v_date <= v_limit loop
      v_start := (v_date + v_pattern.starts_at) at time zone v_staff.timezone;
      v_end := v_start + make_interval(mins => v_duration);
      if v_end > now() and not exists (
        select 1 from public.scheduled_sessions ss
        where ss.service_id = p_service_id and ss.series_id = v_pattern.id and ss.starts_at = v_start
      ) then
        begin
          if exists (
            select 1 from public.availability_exceptions ae
            where ae.staff_id = v_pattern.staff_id and ae.exception_type = 'unavailable'
              and (ae.service_id is null or ae.service_id = p_service_id)
              and tstzrange(ae.starts_at, ae.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
          ) then raise exclusion_violation; end if;
          insert into public.scheduled_sessions (
            business_id, service_id, staff_id, series_id, starts_at, ends_at,
            occupied_starts_at, occupied_ends_at, capacity, is_published, created_by
          ) values (
            v_service.business_id, p_service_id, v_pattern.staff_id, v_pattern.id,
            v_start, v_end,
            v_start - make_interval(mins => v_service.buffer_before_minutes),
            v_end + make_interval(mins => v_service.buffer_after_minutes),
            v_service.capacity, v_service.is_published, (select auth.uid())
          );
          v_created := v_created + 1;
        exception when exclusion_violation then
          if p_strict then
            raise exception 'A selected teacher is unavailable or already scheduled during one of these class times' using errcode = '23P01';
          end if;
        end;
      end if;
      v_date := v_date + 7;
    end loop;
  end loop;
  return v_created;
end;
$$;

create or replace function public.create_class_service_setup(
  p_business_id bigint,
  p_name text,
  p_slug text,
  p_description text,
  p_booking_type text,
  p_capacity integer,
  p_price numeric,
  p_currency text,
  p_price_session_count integer,
  p_package_validity_days integer,
  p_start_date date,
  p_end_date date,
  p_number_of_weeks integer,
  p_open_ended boolean,
  p_is_published boolean,
  p_schedule jsonb
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_id bigint;
  v_end date;
  v_item jsonb;
  v_staff_id bigint;
  v_duration integer;
begin
  if (select auth.uid()) is null or not (select private.has_business_role(p_business_id, array['owner', 'manager'])) then
    raise exception 'Only owners and managers can create classes' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_slug), '') is null then raise exception 'Service name is required' using errcode = '22023'; end if;
  if p_capacity < 1 or p_start_date is null or jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) = 0 then
    raise exception 'Capacity, start date and at least one class day are required' using errcode = '22023';
  end if;
  if exists (select 1 from public.services where business_id = p_business_id and lower(slug) = lower(p_slug)) then
    raise exception 'A service named "%" already exists. Edit the existing service or choose another name.', p_name using errcode = '23505';
  end if;
  if p_open_ended then v_end := null;
  elsif p_end_date is not null then v_end := p_end_date;
  elsif p_number_of_weeks between 1 and 260 then v_end := p_start_date + (p_number_of_weeks * 7 - 1);
  else raise exception 'Choose an end date, number of weeks, or open-ended schedule' using errcode = '22023'; end if;

  v_duration := extract(epoch from (((p_schedule->0->>'ends_at')::time) - ((p_schedule->0->>'starts_at')::time)))::integer / 60;
  if v_duration < 5 then raise exception 'Class end time must be after its start time' using errcode = '22023'; end if;

  insert into public.services (
    business_id, name, slug, description, booking_type, scheduling_mode,
    duration_minutes, slot_interval_minutes, capacity, price, currency,
    price_session_count, package_validity_days, is_published,
    enrollment_mode, cohort_start_date, cohort_end_date, schedule_open_ended
  ) values (
    p_business_id, btrim(p_name), lower(p_slug), nullif(btrim(p_description), ''), p_booking_type, 'scheduled',
    v_duration, 30, p_capacity, p_price, upper(p_currency),
    p_price_session_count, p_package_validity_days, p_is_published,
    'cohort', p_start_date, v_end, p_open_ended
  ) returning id into v_service_id;

  for v_item in select value from jsonb_array_elements(p_schedule) loop
    v_staff_id := (v_item->>'staff_id')::bigint;
    if not exists (select 1 from public.staff_members where id = v_staff_id and business_id = p_business_id and is_active) then
      raise exception 'A selected teacher is unavailable' using errcode = '22023';
    end if;
    insert into public.staff_services (staff_id, service_id, is_active)
      values (v_staff_id, v_service_id, true)
      on conflict (staff_id, service_id) do update set is_active = true;
    insert into public.service_schedule_patterns (business_id, service_id, staff_id, day_of_week, starts_at, ends_at)
      values (p_business_id, v_service_id, v_staff_id, (v_item->>'day_of_week')::smallint,
        (v_item->>'starts_at')::time, (v_item->>'ends_at')::time);
  end loop;

  perform private.materialize_cohort_sessions(v_service_id, coalesce(v_end, p_start_date + 112), true);
  return v_service_id;
end;
$$;

create or replace function private.extend_open_cohort_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_total integer := 0;
begin
  for v_id in select id from public.services where is_active and is_published and enrollment_mode = 'cohort' and schedule_open_ended and not enrollment_closed loop
    v_total := v_total + private.materialize_cohort_sessions(v_id, current_date + 112, false);
  end loop;
  return v_total;
end;
$$;

create or replace function public.get_public_cohort_availability(p_business_slug text)
returns table (service_id bigint, enrolled integer, remaining integer, is_full boolean)
language sql stable security definer set search_path = '' as $$
  select s.id,
    coalesce(sum(e.quantity) filter (where e.status in ('pending','confirmed')), 0)::integer,
    greatest(s.capacity - coalesce(sum(e.quantity) filter (where e.status in ('pending','confirmed')), 0)::integer, 0),
    coalesce(sum(e.quantity) filter (where e.status in ('pending','confirmed')), 0) >= s.capacity
  from public.services s join public.businesses b on b.id = s.business_id
  left join public.class_enrollments e on e.service_id = s.id
  where lower(b.business_slug) = lower(p_business_slug) and s.is_active and s.is_published
    and s.enrollment_mode = 'cohort' and not s.enrollment_closed
  group by s.id;
$$;

create or replace function public.create_public_class_enrollment(
  p_business_slug text, p_service_slug text, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_quantity integer,
  p_joins_on date, p_notes text
) returns table (reference text, remaining integer)
language plpgsql security definer set search_path = '' as $$
declare v_service public.services%rowtype; v_enrolled integer; v_reference text;
begin
  select s.* into v_service from public.services s join public.businesses b on b.id=s.business_id
  where lower(b.business_slug)=lower(p_business_slug) and lower(s.slug)=lower(p_service_slug)
    and s.is_active and s.is_published and s.enrollment_mode='cohort' and not s.enrollment_closed
  for update of s;
  if v_service.id is null then raise exception 'This class is not open for enrolment' using errcode='22023'; end if;
  if nullif(btrim(p_customer_name),'') is null or nullif(btrim(p_customer_phone),'') is null or p_quantity < 1 then
    raise exception 'Name, phone and number of students are required' using errcode='22023';
  end if;
  select coalesce(sum(quantity),0)::integer into v_enrolled from public.class_enrollments
    where service_id=v_service.id and status in ('pending','confirmed');
  if v_enrolled + p_quantity > v_service.capacity then raise exception 'This class no longer has enough places' using errcode='23P01'; end if;
  v_reference := 'EN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.class_enrollments (business_id,service_id,reference,customer_name,customer_email,customer_phone,quantity,joins_on,notes)
  values (v_service.business_id,v_service.id,v_reference,left(btrim(p_customer_name),200),nullif(left(btrim(p_customer_email),320),''),left(btrim(p_customer_phone),50),p_quantity,greatest(coalesce(p_joins_on,current_date),v_service.cohort_start_date),nullif(left(btrim(p_notes),2000),''));
  return query select v_reference, v_service.capacity - v_enrolled - p_quantity;
end;
$$;

create or replace function public.remove_or_archive_service(p_service_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare v_business_id bigint; v_used boolean;
begin
  select business_id into v_business_id from public.services where id=p_service_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Service not found or access denied' using errcode='42501'; end if;
  select exists(select 1 from public.bookings where service_id=p_service_id)
    or exists(select 1 from public.scheduled_sessions where service_id=p_service_id)
    or exists(select 1 from public.class_enrollments where service_id=p_service_id) into v_used;
  if v_used then update public.services set is_active=false,is_published=false,updated_at=now() where id=p_service_id; return 'archived'; end if;
  delete from public.services where id=p_service_id; return 'deleted';
end;
$$;

revoke all on function private.materialize_cohort_sessions(bigint,date,boolean) from public, anon, authenticated;
revoke all on function private.extend_open_cohort_sessions() from public, anon, authenticated;
revoke all on function public.create_class_service_setup(bigint,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.get_public_cohort_availability(text) from public, anon, authenticated;
revoke all on function public.create_public_class_enrollment(text,text,text,text,text,integer,date,text) from public, anon, authenticated;
revoke all on function public.remove_or_archive_service(bigint) from public, anon, authenticated;
grant execute on function public.create_class_service_setup(bigint,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) to authenticated;
grant execute on function public.get_public_cohort_availability(text) to anon, authenticated;
grant execute on function public.create_public_class_enrollment(text,text,text,text,text,integer,date,text) to anon, authenticated;
grant execute on function public.remove_or_archive_service(bigint) to authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname='extend-open-cohort-sessions') then
    perform cron.schedule('extend-open-cohort-sessions','15 2 * * *','select private.extend_open_cohort_sessions();');
  end if;
end $$;
