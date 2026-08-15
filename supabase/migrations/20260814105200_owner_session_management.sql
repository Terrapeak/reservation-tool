-- Owner calendar editing and registration management for scheduled services.

create or replace function public.update_scheduled_session(
  p_session_id bigint,
  p_staff_id bigint,
  p_local_starts_at timestamp,
  p_duration_minutes integer,
  p_capacity integer,
  p_is_published boolean,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.scheduled_sessions%rowtype;
  v_timezone text;
  v_buffer_before integer;
  v_buffer_after integer;
  v_reserved integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_duration_minutes < 5 or p_capacity < 1 then
    raise exception 'Invalid duration or capacity' using errcode = '22023';
  end if;

  select * into v_session
  from public.scheduled_sessions
  where id = p_session_id
  for update;

  if v_session.id is null
    or not (select private.has_business_role(v_session.business_id, array['owner', 'manager'])) then
    raise exception 'Session not found or access denied' using errcode = '42501';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'Only scheduled sessions can be edited' using errcode = '22023';
  end if;

  select sm.timezone, service.buffer_before_minutes, service.buffer_after_minutes
  into v_timezone, v_buffer_before, v_buffer_after
  from public.services service
  join public.staff_services assignment
    on assignment.service_id = service.id
   and assignment.staff_id = p_staff_id
   and assignment.is_active
  join public.staff_members sm
    on sm.id = assignment.staff_id
   and sm.business_id = service.business_id
   and sm.is_active
  where service.id = v_session.service_id
    and service.business_id = v_session.business_id
    and service.is_active
    and service.scheduling_mode = 'scheduled';

  if v_timezone is null then
    raise exception 'The selected staff member is not assigned to this scheduled service' using errcode = '22023';
  end if;

  -- Serialize calendar writes for both the old and replacement staff member.
  perform pg_catalog.pg_advisory_xact_lock(least(v_session.staff_id, p_staff_id));
  if v_session.staff_id <> p_staff_id then
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_session.staff_id, p_staff_id));
  end if;

  select coalesce(sum(quantity), 0)::integer into v_reserved
  from public.bookings
  where scheduled_session_id = p_session_id
    and status in ('pending', 'confirmed');

  if p_capacity < v_reserved then
    raise exception 'Capacity cannot be lower than the % currently reserved place(s)', v_reserved using errcode = '22023';
  end if;

  v_start := p_local_starts_at at time zone v_timezone;
  v_end := v_start + make_interval(mins => p_duration_minutes);

  if exists (
    select 1 from public.bookings booking
    where booking.staff_id = p_staff_id
      and booking.status in ('pending', 'confirmed')
      and tstzrange(booking.occupied_starts_at, booking.occupied_ends_at, '[)') &&
        tstzrange(v_start - make_interval(mins => v_buffer_before),
                  v_end + make_interval(mins => v_buffer_after), '[)')
  ) then
    raise exception 'The staff member already has an appointment during this time' using errcode = '23P01';
  end if;

  if exists (
    select 1 from public.availability_exceptions exception
    where exception.staff_id = p_staff_id
      and exception.exception_type = 'unavailable'
      and (exception.service_id is null or exception.service_id = v_session.service_id)
      and tstzrange(exception.starts_at, exception.ends_at, '[)') &&
        tstzrange(v_start - make_interval(mins => v_buffer_before),
                  v_end + make_interval(mins => v_buffer_after), '[)')
  ) then
    raise exception 'The staff member is marked unavailable during this time' using errcode = '23P01';
  end if;

  update public.scheduled_sessions
  set staff_id = p_staff_id,
      starts_at = v_start,
      ends_at = v_end,
      occupied_starts_at = v_start - make_interval(mins => v_buffer_before),
      occupied_ends_at = v_end + make_interval(mins => v_buffer_after),
      capacity = p_capacity,
      is_published = p_is_published,
      notes = nullif(left(btrim(p_notes), 1000), ''),
      updated_at = now()
  where id = p_session_id;

  update public.bookings
  set starts_at = v_start,
      ends_at = v_end,
      occupied_starts_at = v_start,
      occupied_ends_at = v_end,
      updated_at = now()
  where scheduled_session_id = p_session_id
    and status in ('pending', 'confirmed');
exception when exclusion_violation then
  raise exception 'The staff member already has a scheduled session during this time' using errcode = '23P01';
end;
$$;

create or replace function public.set_scheduled_booking_status(
  p_booking_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
begin
  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') then
    raise exception 'Invalid booking status' using errcode = '22023';
  end if;

  select booking.business_id into v_business_id
  from public.bookings booking
  where booking.id = p_booking_id
    and booking.scheduled_session_id is not null;

  if v_business_id is null
    or not (select private.has_business_role(v_business_id, array['owner', 'manager'])) then
    raise exception 'Registration not found or access denied' using errcode = '42501';
  end if;

  update public.bookings
  set status = p_status, updated_at = now()
  where id = p_booking_id;
end;
$$;

revoke all on function public.update_scheduled_session(bigint,bigint,timestamp,integer,integer,boolean,text) from public, anon, authenticated;
revoke all on function public.set_scheduled_booking_status(uuid,text) from public, anon, authenticated;
grant execute on function public.update_scheduled_session(bigint,bigint,timestamp,integer,integer,boolean,text) to authenticated;
grant execute on function public.set_scheduled_booking_status(uuid,text) to authenticated;

