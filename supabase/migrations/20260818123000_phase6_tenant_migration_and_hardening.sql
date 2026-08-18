-- Phase 6: explicit, tenant-scoped legacy migration and canonical hardening.
-- The migration RPC is service-role only and performs each tenant conversion in
-- one transaction. Legacy rows remain unchanged for rollback/audit.

create table if not exists private.booking_model_migration_runs (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  source_model_version smallint not null,
  target_model_version smallint not null,
  timezone text not null,
  legacy_count integer not null,
  migrated_count integer not null default 0,
  status text not null check (status in ('started', 'completed', 'failed')),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists booking_model_migration_runs_business_started_idx
  on private.booking_model_migration_runs (business_id, started_at desc);

revoke all on table private.booking_model_migration_runs from public, anon, authenticated;
grant select, insert, update on table private.booking_model_migration_runs to service_role;

create or replace function public.migrate_legacy_reservations_business(
  p_business_id bigint,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses%rowtype;
  v_settings public.restaurant_settings%rowtype;
  v_legacy_count integer;
  v_existing_count integer;
  v_conflict_count integer;
  v_historical_service_id bigint;
  v_active_service_id bigint;
  v_run_id uuid;
  v_migrated_count integer;
  v_active_name text;
  v_active_slug text;
  v_active_type text;
begin
  if p_business_id is null or p_business_id <= 0 then
    raise exception 'A positive business ID is required' using errcode = '22023';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;
  if v_business.id is null then
    raise exception 'Reservations business not found' using errcode = 'P0002';
  end if;

  select * into v_settings
  from public.restaurant_settings
  where business_id = p_business_id;
  if v_settings.id is null or nullif(btrim(v_settings.timezone), '') is null then
    raise exception 'A reviewed tenant timezone is required before migration' using errcode = '22023';
  end if;

  -- Reject invalid IANA timezone names before converting local legacy times.
  perform now() at time zone v_settings.timezone;

  select count(*)::integer into v_legacy_count
  from public.reservations where business_id = p_business_id;

  select count(*)::integer into v_existing_count
  from public.bookings where business_id = p_business_id;

  select count(*)::integer into v_conflict_count
  from public.reservations reservation
  where reservation.business_id = p_business_id
    and exists (
      select 1 from public.bookings booking
      where booking.business_id = p_business_id
        and (booking.id = reservation.id
          or (reservation.reservation_reference is not null
            and booking.reference = reservation.reservation_reference))
        and not (
          booking.id = reservation.id
          and booking.reference is not distinct from reservation.reservation_reference
          and booking.customer_name is not distinct from reservation.customer_name
          and booking.customer_phone is not distinct from reservation.phone
          and booking.quantity = reservation.party_size
        )
    );

  if v_conflict_count > 0 then
    raise exception 'Canonical ID/reference conflicts must be resolved before migration' using errcode = '23505';
  end if;

  if not p_apply then
    return jsonb_build_object(
      'apply', false,
      'business_id', p_business_id,
      'business_slug', v_business.business_slug,
      'booking_model_version', v_business.booking_model_version,
      'timezone', v_settings.timezone,
      'legacy_count', v_legacy_count,
      'canonical_count', v_existing_count,
      'conflict_count', v_conflict_count,
      'ready', v_business.booking_model_version = 1 and v_conflict_count = 0
    );
  end if;

  if v_business.booking_model_version <> 1 then
    raise exception 'Only booking model version 1 tenants can be migrated' using errcode = '55000';
  end if;

  insert into private.booking_model_migration_runs (
    business_id, source_model_version, target_model_version, timezone,
    legacy_count, status, details
  ) values (
    p_business_id, 1, 2, v_settings.timezone,
    v_legacy_count, 'started', jsonb_build_object('preexisting_canonical_count', v_existing_count)
  ) returning id into v_run_id;

  insert into public.services (
    business_id, name, slug, description, booking_type, duration_minutes,
    slot_interval_minutes, capacity, is_active, is_published
  ) values (
    p_business_id, 'Legacy Reservation History', 'legacy-reservation-history',
    'Historical records migrated from the legacy reservation model.',
    case when v_business.business_type = 'restaurant' then 'restaurant' else 'appointment' end,
    greatest(coalesce(v_settings.default_duration_minutes, 60), 1), 30,
    greatest(coalesce(v_settings.max_guests_per_slot, 1), 1), false, false
  ) on conflict (business_id, slug) do update
    set is_active = false, is_published = false
  returning id into v_historical_service_id;

  if v_business.business_type = 'restaurant' then
    v_active_name := 'Restaurant Reservation';
    v_active_slug := 'restaurant-reservation';
    v_active_type := 'restaurant';
  else
    v_active_name := 'Appointment';
    v_active_slug := 'appointment';
    v_active_type := 'appointment';
  end if;

  insert into public.services (
    business_id, name, slug, description, booking_type, duration_minutes,
    slot_interval_minutes, capacity, is_active, is_published
  ) values (
    p_business_id, v_active_name, v_active_slug,
    'Customer-facing canonical booking service.', v_active_type,
    greatest(coalesce(v_settings.default_duration_minutes, 60), 1), 30,
    greatest(coalesce(v_settings.max_guests_per_slot, 1), 1), true, true
  ) on conflict (business_id, slug) do update set
    is_active = true, is_published = true
  returning id into v_active_service_id;

  insert into public.bookings (
    id, business_id, service_id, customer_name, customer_phone,
    starts_at, ends_at, occupied_starts_at, occupied_ends_at, quantity,
    status, reference, notes, custom_data, created_at, updated_at
  )
  select reservation.id, reservation.business_id, v_historical_service_id,
    reservation.customer_name, reservation.phone,
    (reservation.reservation_date + reservation.reservation_time) at time zone v_settings.timezone,
    ((reservation.reservation_date + reservation.reservation_time) at time zone v_settings.timezone)
      + make_interval(mins => greatest(coalesce(v_settings.default_duration_minutes, 60), 1)),
    (reservation.reservation_date + reservation.reservation_time) at time zone v_settings.timezone,
    ((reservation.reservation_date + reservation.reservation_time) at time zone v_settings.timezone)
      + make_interval(mins => greatest(coalesce(v_settings.default_duration_minutes, 60), 1)),
    greatest(coalesce(reservation.party_size, 1), 1),
    case
      when lower(coalesce(reservation.status, 'confirmed')) in ('pending','confirmed','completed','cancelled','no_show')
        then lower(coalesce(reservation.status, 'confirmed'))
      when lower(coalesce(reservation.status, '')) in ('canceled','archived') then 'cancelled'
      else 'confirmed'
    end,
    coalesce(nullif(reservation.reservation_reference, ''), 'LEGACY-' || upper(substr(replace(reservation.id::text, '-', ''), 1, 12))),
    reservation.special_request,
    coalesce(reservation.custom_data, '{}'::jsonb) || jsonb_build_object(
      'migration', jsonb_build_object(
        'run_id', v_run_id,
        'source_table', 'reservations',
        'source_id', reservation.id,
        'source_archived', reservation.is_archived,
        'source_status', reservation.status,
        'source_timezone', v_settings.timezone,
        'migrated_at', now()
      )
    ),
    coalesce(reservation.created_at, now()), now()
  from public.reservations reservation
  where reservation.business_id = p_business_id
  on conflict (id) do nothing;

  select count(*)::integer into v_migrated_count
  from public.reservations reservation
  join public.bookings booking on booking.id = reservation.id
  where reservation.business_id = p_business_id
    and booking.business_id = p_business_id
    and booking.reference = coalesce(nullif(reservation.reservation_reference, ''), 'LEGACY-' || upper(substr(replace(reservation.id::text, '-', ''), 1, 12)))
    and booking.customer_name is not distinct from reservation.customer_name
    and booking.customer_phone is not distinct from reservation.phone
    and booking.quantity = greatest(coalesce(reservation.party_size, 1), 1);

  if v_migrated_count <> v_legacy_count then
    raise exception 'Post-migration validation failed: expected %, validated %', v_legacy_count, v_migrated_count;
  end if;

  update public.businesses set booking_model_version = 2 where id = p_business_id;
  update private.booking_model_migration_runs
  set migrated_count = v_migrated_count, status = 'completed', completed_at = now(),
      details = details || jsonb_build_object(
        'historical_service_id', v_historical_service_id,
        'active_service_id', v_active_service_id
      )
  where id = v_run_id;

  return jsonb_build_object(
    'apply', true, 'run_id', v_run_id, 'business_id', p_business_id,
    'timezone', v_settings.timezone, 'legacy_count', v_legacy_count,
    'migrated_count', v_migrated_count, 'booking_model_version', 2,
    'historical_service_id', v_historical_service_id,
    'active_service_id', v_active_service_id
  );
end;
$$;

revoke all on function public.migrate_legacy_reservations_business(bigint, boolean) from public, anon, authenticated;
grant execute on function public.migrate_legacy_reservations_business(bigint, boolean) to service_role;

-- Canonical tenants cannot receive new legacy rows or application mutations.
-- Version-1 tenants retain compatibility access until explicitly migrated.
create or replace function public.prevent_canonical_tenant_legacy_reservation_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id bigint;
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
  else
    v_business_id := new.business_id;
  end if;
  if exists (
    select 1 from public.businesses
    where id = v_business_id and booking_model_version >= 2
  ) then
    raise exception 'Legacy reservation writes are disabled for canonical tenants' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_canonical_tenant_legacy_reservation_write on public.reservations;
create trigger prevent_canonical_tenant_legacy_reservation_write
before insert or update or delete on public.reservations
for each row execute function public.prevent_canonical_tenant_legacy_reservation_write();

revoke all on function public.prevent_canonical_tenant_legacy_reservation_write() from public, anon, authenticated;
grant execute on function public.prevent_canonical_tenant_legacy_reservation_write() to service_role;

create index if not exists reservations_business_reference_idx
  on public.reservations (business_id, reservation_reference)
  where reservation_reference is not null;
create index if not exists reservations_business_date_idx
  on public.reservations (business_id, reservation_date, reservation_time);
create index if not exists bookings_business_phone_active_idx
  on public.bookings (business_id, customer_phone, starts_at)
  where status in ('pending', 'confirmed');

-- Internal canonical operations must never be exposed to browser roles.
revoke all on function public.create_canonical_restaurant_booking(bigint,text,text,date,time,integer,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_canonical_restaurant_booking(bigint,text,text,date,time,integer,text,jsonb,text)
  to service_role;
revoke all on function public.update_canonical_restaurant_booking(bigint,uuid,date,time,integer,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_canonical_restaurant_booking(bigint,uuid,date,time,integer,text,jsonb)
  to service_role;

comment on function public.migrate_legacy_reservations_business(bigint, boolean) is
  'Service-role-only, tenant-scoped dry-run/apply migration from legacy reservations to canonical bookings.';
