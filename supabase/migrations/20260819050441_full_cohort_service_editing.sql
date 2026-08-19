-- Edit cohort details and the complete future timetable in one transaction.

create or replace function public.update_class_service_setup_v2(
  p_service_id bigint,
  p_name text,
  p_slug text,
  p_subject text,
  p_description text,
  p_capacity integer,
  p_price numeric,
  p_price_session_count integer,
  p_package_validity_days integer,
  p_start_date date,
  p_end_date date,
  p_number_of_weeks integer,
  p_open_ended boolean,
  p_apply_from date,
  p_is_published boolean,
  p_schedule jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
  v_end date;
  v_item jsonb;
  v_staff_id bigint;
  v_duration integer;
  v_enrolled integer;
  v_created integer;
begin
  select * into v_service from public.services where id = p_service_id for update;
  if v_service.id is null or v_service.enrollment_mode <> 'cohort'
    or not (select private.has_business_role(v_service.business_id, array['owner', 'manager'])) then
    raise exception 'Class not found or access denied' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_slug), '') is null or nullif(btrim(p_subject), '') is null then
    raise exception 'Name and subject are required' using errcode = '22023';
  end if;
  if p_capacity < 1 or p_start_date is null or p_apply_from is null
    or jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) = 0 then
    raise exception 'Capacity, dates and at least one class day are required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.services
    where business_id = v_service.business_id and id <> p_service_id and lower(slug) = lower(p_slug)
  ) then
    raise exception 'A service named "%" already exists. Edit the existing service or choose another name.', p_name using errcode = '23505';
  end if;

  select coalesce(sum(quantity), 0)::integer into v_enrolled
  from public.class_enrollments
  where service_id = p_service_id and status in ('pending', 'confirmed');
  if p_capacity < v_enrolled then
    raise exception 'Capacity cannot be lower than the % current enrolments', v_enrolled using errcode = '22023';
  end if;

  if p_open_ended then v_end := null;
  elsif p_end_date is not null then v_end := p_end_date;
  elsif p_number_of_weeks between 1 and 260 then v_end := p_start_date + (p_number_of_weeks * 7 - 1);
  else raise exception 'Choose an end date, number of weeks, or open-ended schedule' using errcode = '22023';
  end if;
  if v_end is not null and v_end < p_start_date then
    raise exception 'Class end date must not be before its start date' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_schedule) loop
    v_staff_id := (v_item->>'staff_id')::bigint;
    if (v_item->>'ends_at')::time <= (v_item->>'starts_at')::time then
      raise exception 'Every class end time must be after its start time' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.staff_members staff
      join public.staff_subjects subject on subject.staff_id = staff.id and subject.business_id = staff.business_id
      where staff.id = v_staff_id and staff.business_id = v_service.business_id and staff.is_active
        and lower(subject.subject) = lower(btrim(p_subject))
    ) then
      raise exception 'Every selected teacher must be active and qualified for %', btrim(p_subject) using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from public.bookings booking
    join public.scheduled_sessions session on session.id = booking.scheduled_session_id
    join public.staff_members staff on staff.id = session.staff_id
    where session.service_id = p_service_id
      and session.status = 'scheduled'
      and (session.starts_at at time zone staff.timezone)::date >= p_apply_from
      and booking.status in ('pending', 'confirmed')
  ) then
    raise exception 'A future class already has bookings. Reschedule or cancel those bookings before changing the timetable.' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(42001, p_service_id::integer);
  delete from public.scheduled_sessions session
  using public.staff_members staff
  where session.staff_id = staff.id and session.service_id = p_service_id
    and session.status = 'scheduled'
    and (session.starts_at at time zone staff.timezone)::date >= p_apply_from;
  delete from public.service_schedule_patterns where service_id = p_service_id;
  update public.staff_services set is_active = false where service_id = p_service_id;

  v_duration := extract(epoch from (((p_schedule->0->>'ends_at')::time) - ((p_schedule->0->>'starts_at')::time)))::integer / 60;
  update public.services set
    name = btrim(p_name), slug = lower(p_slug), subject = btrim(p_subject),
    description = nullif(btrim(p_description), ''), capacity = p_capacity,
    price = p_price, price_session_count = p_price_session_count,
    package_validity_days = p_package_validity_days,
    duration_minutes = v_duration, cohort_start_date = p_start_date,
    cohort_end_date = v_end, schedule_open_ended = p_open_ended,
    is_published = p_is_published, updated_at = now()
  where id = p_service_id;

  for v_item in select value from jsonb_array_elements(p_schedule) loop
    v_staff_id := (v_item->>'staff_id')::bigint;
    insert into public.staff_services (staff_id, service_id, is_active)
      values (v_staff_id, p_service_id, true)
      on conflict (staff_id, service_id) do update set is_active = true;
    insert into public.service_schedule_patterns (
      business_id, service_id, staff_id, day_of_week, starts_at, ends_at
    ) values (
      v_service.business_id, p_service_id, v_staff_id,
      (v_item->>'day_of_week')::smallint,
      (v_item->>'starts_at')::time, (v_item->>'ends_at')::time
    );
  end loop;

  v_created := private.materialize_cohort_sessions(
    p_service_id,
    coalesce(v_end, greatest(p_apply_from, current_date) + 112),
    true
  );
  return v_created;
exception when exclusion_violation then
  raise exception 'A selected teacher is unavailable or already scheduled during one of the new class times' using errcode = '23P01';
end;
$$;

revoke all on function public.update_class_service_setup_v2(
  bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb
) from public, anon, authenticated;
grant execute on function public.update_class_service_setup_v2(
  bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb
) to authenticated;
