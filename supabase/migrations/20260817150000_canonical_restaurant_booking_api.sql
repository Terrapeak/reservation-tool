-- Canonical restaurant booking operations for model-version 2 tenants.
-- Legacy public.reservations rows remain untouched for rollback and audit.

alter table public.restaurant_settings
  add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';

-- TerraPeak's migrated service is historical-only. Provision a distinct active
-- service for new customer bookings without changing the historical service.
insert into public.services (
  business_id, name, slug, description, booking_type, duration_minutes,
  slot_interval_minutes, capacity, is_active, is_published
)
select
  b.id,
  'Restaurant Reservation',
  'restaurant-reservation',
  'Customer-facing restaurant reservations.',
  'restaurant',
  rs.default_duration_minutes,
  30,
  rs.max_guests_per_slot,
  true,
  true
from public.businesses b
join public.restaurant_settings rs on rs.business_id = b.id
where b.business_slug = 'terrapeak'
  and b.booking_model_version = 2
  and not exists (
    select 1
    from public.services service
    where service.business_id = b.id
      and service.booking_type = 'restaurant'
      and service.is_active
  );

create or replace function private.get_canonical_restaurant_context(
  p_business_id bigint
)
returns table (
  service_id bigint,
  duration_minutes integer,
  slot_interval_minutes integer,
  capacity integer,
  opening_time time,
  closing_time time,
  timezone text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select service.id,
    service.duration_minutes,
    service.slot_interval_minutes,
    service.capacity,
    settings.opening_time,
    settings.closing_time,
    settings.timezone
  from public.businesses business
  join public.services service on service.business_id = business.id
  join public.restaurant_settings settings on settings.business_id = business.id
  where business.id = p_business_id
    and business.booking_model_version = 2
    and service.booking_type = 'restaurant'
    and service.is_active
    and service.is_published
  order by service.id
  limit 1;
$$;

create or replace function public.check_canonical_restaurant_availability(
  p_business_id bigint,
  p_local_date date,
  p_local_time time,
  p_quantity integer,
  p_exclude_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_starts_at timestamptz;
  v_reserved integer;
begin
  if p_quantity is null or p_quantity < 1 then return false; end if;

  select * into v_context
  from private.get_canonical_restaurant_context(p_business_id);

  if v_context.service_id is null
    or p_local_time < v_context.opening_time
    or p_local_time >= v_context.closing_time
    or mod(
      (extract(epoch from (p_local_time - v_context.opening_time)) / 60)::integer,
      v_context.slot_interval_minutes
    ) <> 0 then
    return false;
  end if;

  v_starts_at := (p_local_date + p_local_time) at time zone v_context.timezone;
  if v_starts_at <= now() then return false; end if;

  select coalesce(sum(booking.quantity), 0)::integer into v_reserved
  from public.bookings booking
  where booking.business_id = p_business_id
    and booking.service_id = v_context.service_id
    and booking.starts_at = v_starts_at
    and booking.status in ('pending', 'confirmed')
    and (p_exclude_booking_id is null or booking.id <> p_exclude_booking_id);

  return v_reserved + p_quantity <= v_context.capacity;
end;
$$;

create or replace function public.create_canonical_restaurant_booking(
  p_business_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_local_date date,
  p_local_time time,
  p_quantity integer,
  p_notes text default null,
  p_custom_data jsonb default '{}'::jsonb,
  p_customer_email text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_reference text;
  v_booking public.bookings%rowtype;
begin
  if nullif(btrim(p_customer_name), '') is null
    or length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 6
    or p_quantity is null or p_quantity < 1 then
    raise exception 'Customer name, phone and valid quantity are required' using errcode = '22023';
  end if;

  select * into v_context
  from private.get_canonical_restaurant_context(p_business_id);
  if v_context.service_id is null then
    raise exception 'Reservations are not configured for this business' using errcode = 'P0002';
  end if;

  v_starts_at := (p_local_date + p_local_time) at time zone v_context.timezone;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_business_id::text || ':' || v_context.service_id::text || ':' || v_starts_at::text,
      0
    )
  );

  if not public.check_canonical_restaurant_availability(
    p_business_id, p_local_date, p_local_time, p_quantity, null
  ) then
    raise exception 'This time slot no longer has enough capacity' using errcode = '23P01';
  end if;

  v_ends_at := v_starts_at + make_interval(mins => v_context.duration_minutes);
  v_reference := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.bookings (
    business_id, service_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, occupied_starts_at, occupied_ends_at, quantity,
    status, reference, notes, custom_data
  ) values (
    p_business_id, v_context.service_id, left(btrim(p_customer_name), 200),
    nullif(left(btrim(p_customer_email), 320), ''), left(btrim(p_customer_phone), 50),
    v_starts_at, v_ends_at, v_starts_at, v_ends_at, p_quantity,
    'confirmed', v_reference, nullif(left(btrim(p_notes), 2000), ''),
    coalesce(p_custom_data, '{}'::jsonb)
  ) returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.update_canonical_restaurant_booking(
  p_business_id bigint,
  p_booking_id uuid,
  p_local_date date,
  p_local_time time,
  p_quantity integer,
  p_notes text default null,
  p_custom_data jsonb default '{}'::jsonb
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking public.bookings%rowtype;
begin
  select * into v_context
  from private.get_canonical_restaurant_context(p_business_id);
  if v_context.service_id is null then
    raise exception 'Reservations are not configured for this business' using errcode = 'P0002';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and business_id = p_business_id
    and service_id = v_context.service_id
    and status = 'confirmed'
  for update;
  if v_booking.id is null then
    raise exception 'Active booking not found' using errcode = 'P0002';
  end if;

  v_starts_at := (p_local_date + p_local_time) at time zone v_context.timezone;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_business_id::text || ':' || v_context.service_id::text || ':' || v_starts_at::text,
      0
    )
  );

  if not public.check_canonical_restaurant_availability(
    p_business_id, p_local_date, p_local_time, p_quantity, p_booking_id
  ) then
    raise exception 'This time slot no longer has enough capacity' using errcode = '23P01';
  end if;

  v_ends_at := v_starts_at + make_interval(mins => v_context.duration_minutes);
  update public.bookings
  set starts_at = v_starts_at,
      ends_at = v_ends_at,
      occupied_starts_at = v_starts_at,
      occupied_ends_at = v_ends_at,
      quantity = p_quantity,
      notes = nullif(left(btrim(p_notes), 2000), ''),
      custom_data = coalesce(p_custom_data, '{}'::jsonb),
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.get_public_restaurant_slots(
  p_business_slug text,
  p_local_date date
)
returns table (
  reservation_time time,
  remaining_capacity integer,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  with context as (
    select business.id business_id, restaurant.*
    from public.businesses business
    cross join lateral private.get_canonical_restaurant_context(business.id) restaurant
    where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
      and p_local_date between current_date and current_date + 730
  ), slots as (
    select context.*,
      generated_slot::time reservation_time,
      (p_local_date + generated_slot::time) at time zone context.timezone starts_at
    from context
    cross join lateral generate_series(
      p_local_date + context.opening_time,
      p_local_date + context.closing_time - make_interval(mins => context.slot_interval_minutes),
      make_interval(mins => context.slot_interval_minutes)
    ) generated_slot
  )
  select slots.reservation_time,
    greatest(
      slots.capacity - coalesce(sum(booking.quantity) filter (
        where booking.status in ('pending', 'confirmed')
      ), 0)::integer,
      0
    ) remaining_capacity,
    slots.timezone
  from slots
  left join public.bookings booking
    on booking.business_id = slots.business_id
   and booking.service_id = slots.service_id
   and booking.starts_at = slots.starts_at
  where slots.starts_at > now()
  group by slots.business_id, slots.service_id, slots.reservation_time,
    slots.starts_at, slots.capacity, slots.timezone
  having slots.capacity - coalesce(sum(booking.quantity) filter (
    where booking.status in ('pending', 'confirmed')
  ), 0) > 0
  order by slots.reservation_time;
$$;

create or replace function public.check_public_restaurant_availability(
  p_business_slug text,
  p_reservation_date date,
  p_reservation_time time,
  p_party_size integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.check_canonical_restaurant_availability(
      business.id,
      p_reservation_date,
      p_reservation_time,
      p_party_size,
      null
    )
    from public.businesses business
    where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
      and business.booking_model_version = 2
  ), false);
$$;

create or replace function public.create_public_restaurant_reservation(
  p_business_slug text,
  p_customer_name text,
  p_phone text,
  p_reservation_date date,
  p_reservation_time time,
  p_party_size integer,
  p_special_request text default null,
  p_custom_data jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
  v_booking public.bookings%rowtype;
begin
  select id into v_business_id
  from public.businesses
  where lower(business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and booking_model_version = 2;
  if v_business_id is null then
    raise exception 'Reservations are not configured for this business' using errcode = 'P0002';
  end if;

  v_booking := public.create_canonical_restaurant_booking(
    v_business_id, p_customer_name, p_phone, p_reservation_date,
    p_reservation_time, p_party_size, p_special_request, p_custom_data, null
  );
  return v_booking.reference;
end;
$$;

create or replace function public.get_public_restaurant_reservation(
  p_business_slug text,
  p_reservation_reference text,
  p_phone text
)
returns table (
  reservation_date date,
  reservation_time time,
  party_size integer,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select (booking.starts_at at time zone settings.timezone)::date,
    (booking.starts_at at time zone settings.timezone)::time,
    booking.quantity,
    booking.status
  from public.bookings booking
  join public.businesses business on business.id = booking.business_id
  join public.services service on service.id = booking.service_id
  join public.restaurant_settings settings on settings.business_id = business.id
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and service.booking_type = 'restaurant'
    and booking.reference = nullif(btrim(p_reservation_reference), '')
    and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 6
    and regexp_replace(booking.customer_phone, '[^0-9]', '', 'g') =
      regexp_replace(p_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

create or replace function public.get_public_restaurant_reschedule_slots(
  p_business_slug text,
  p_reservation_reference text,
  p_phone text,
  p_local_date date
)
returns table (reservation_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select slot.reservation_time
  from public.bookings booking
  join public.businesses business on business.id = booking.business_id
  join public.services service on service.id = booking.service_id
  cross join lateral public.get_public_restaurant_slots(
    business.business_slug,
    p_local_date
  ) slot
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and service.booking_type = 'restaurant'
    and booking.reference = nullif(btrim(p_reservation_reference), '')
    and regexp_replace(booking.customer_phone, '[^0-9]', '', 'g') =
      regexp_replace(p_phone, '[^0-9]', '', 'g')
    and booking.status in ('pending', 'confirmed')
    and public.check_canonical_restaurant_availability(
      business.id, p_local_date, slot.reservation_time, booking.quantity, booking.id
    )
  order by slot.reservation_time;
$$;

create or replace function public.reschedule_public_restaurant_reservation(
  p_business_slug text,
  p_reservation_reference text,
  p_phone text,
  p_new_date date,
  p_new_time time
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select booking.* into v_booking
  from public.bookings booking
  join public.businesses business on business.id = booking.business_id
  join public.services service on service.id = booking.service_id
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and service.booking_type = 'restaurant'
    and booking.reference = nullif(btrim(p_reservation_reference), '')
    and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 6
    and regexp_replace(booking.customer_phone, '[^0-9]', '', 'g') =
      regexp_replace(p_phone, '[^0-9]', '', 'g')
    and booking.status in ('pending', 'confirmed');
  if v_booking.id is null then return false; end if;

  v_booking := public.update_canonical_restaurant_booking(
    v_booking.business_id, v_booking.id, p_new_date, p_new_time,
    v_booking.quantity, v_booking.notes, v_booking.custom_data
  );
  return v_booking.id is not null;
end;
$$;

create or replace function public.cancel_public_restaurant_reservation(
  p_business_slug text,
  p_reservation_reference text,
  p_phone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 6 then return false; end if;
  update public.bookings booking
  set status = 'cancelled', updated_at = now()
  from public.businesses business, public.services service
  where booking.business_id = business.id
    and booking.service_id = service.id
    and lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and service.booking_type = 'restaurant'
    and booking.reference = nullif(btrim(p_reservation_reference), '')
    and regexp_replace(booking.customer_phone, '[^0-9]', '', 'g') =
      regexp_replace(p_phone, '[^0-9]', '', 'g')
    and booking.status in ('pending', 'confirmed');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.get_public_booking_for_management(
  p_business_slug text,
  p_reference text,
  p_phone text
)
returns table (
  booking_kind text,
  service_slug text,
  service_name text,
  staff_slug text,
  staff_name text,
  staff_timezone text,
  starts_at timestamptz,
  ends_at timestamptz,
  quantity integer,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select case
      when service.booking_type = 'restaurant' then 'restaurant'
      when booking.scheduled_session_id is null then 'appointment'
      else 'session'
    end,
    service.slug,
    service.name,
    staff.slug,
    staff.display_name,
    case
      when service.booking_type = 'restaurant' then settings.timezone
      else coalesce(staff.timezone, 'UTC')
    end,
    booking.starts_at,
    booking.ends_at,
    booking.quantity,
    booking.status
  from public.bookings booking
  join public.businesses business on business.id = booking.business_id
  join public.services service on service.id = booking.service_id
  left join public.restaurant_settings settings on settings.business_id = business.id
  left join public.staff_members staff on staff.id = coalesce(
    booking.staff_id,
    (select session.staff_id
     from public.scheduled_sessions session
     where session.id = booking.scheduled_session_id)
  )
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and booking.reference = nullif(btrim(p_reference), '')
    and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 6
    and regexp_replace(booking.customer_phone, '[^0-9]', '', 'g') =
      regexp_replace(p_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

revoke all on function private.get_canonical_restaurant_context(bigint) from public, anon, authenticated;
revoke all on function public.check_canonical_restaurant_availability(bigint,date,time,integer,uuid) from public, anon, authenticated;
revoke all on function public.create_canonical_restaurant_booking(bigint,text,text,date,time,integer,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.update_canonical_restaurant_booking(bigint,uuid,date,time,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.get_public_restaurant_slots(text,date) from public, anon, authenticated;
revoke all on function public.check_public_restaurant_availability(text,date,time,integer) from public, anon, authenticated;
revoke all on function public.create_public_restaurant_reservation(text,text,text,date,time,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.get_public_restaurant_reservation(text,text,text) from public, anon, authenticated;
revoke all on function public.get_public_restaurant_reschedule_slots(text,text,text,date) from public, anon, authenticated;
revoke all on function public.reschedule_public_restaurant_reservation(text,text,text,date,time) from public, anon, authenticated;
revoke all on function public.cancel_public_restaurant_reservation(text,text,text) from public, anon, authenticated;
revoke all on function public.get_public_booking_for_management(text,text,text) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_canonical_restaurant_context(bigint) to service_role;
grant execute on function public.check_canonical_restaurant_availability(bigint,date,time,integer,uuid) to service_role;
grant execute on function public.create_canonical_restaurant_booking(bigint,text,text,date,time,integer,text,jsonb,text) to service_role;
grant execute on function public.update_canonical_restaurant_booking(bigint,uuid,date,time,integer,text,jsonb) to service_role;
grant execute on function public.get_public_restaurant_slots(text,date) to anon, authenticated;
grant execute on function public.check_public_restaurant_availability(text,date,time,integer) to anon, authenticated;
grant execute on function public.create_public_restaurant_reservation(text,text,text,date,time,integer,text,jsonb) to anon, authenticated;
grant execute on function public.get_public_restaurant_reservation(text,text,text) to anon, authenticated;
grant execute on function public.get_public_restaurant_reschedule_slots(text,text,text,date) to anon, authenticated;
grant execute on function public.reschedule_public_restaurant_reservation(text,text,text,date,time) to anon, authenticated;
grant execute on function public.cancel_public_restaurant_reservation(text,text,text) to anon, authenticated;
grant execute on function public.get_public_booking_for_management(text,text,text) to anon, authenticated;

create or replace function private.freeze_legacy_reservations_for_canonical_tenants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
begin
  if exists (
    select 1
    from public.businesses business
    where business.id = v_business_id
      and business.booking_model_version >= 2
  ) then
    raise exception 'Legacy reservations are frozen for canonical booking tenants'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists freeze_legacy_reservations_for_canonical_tenants
  on public.reservations;
create trigger freeze_legacy_reservations_for_canonical_tenants
before insert or update or delete on public.reservations
for each row execute function private.freeze_legacy_reservations_for_canonical_tenants();

revoke all on function private.freeze_legacy_reservations_for_canonical_tenants()
  from public, anon, authenticated;
