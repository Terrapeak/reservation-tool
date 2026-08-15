-- RLS/security audit: remove legacy anonymous writes and expose only deliberate APIs.

-- Legacy public policies allowed anyone with the publishable key to modify or read
-- customer and configuration data. Replace them with tenant-aware policies.
drop policy if exists "Allow public delete booking custom fields" on public.booking_custom_fields;
drop policy if exists "Allow public insert booking custom fields" on public.booking_custom_fields;
drop policy if exists "Allow public read booking custom fields" on public.booking_custom_fields;
drop policy if exists "Allow public update booking custom fields" on public.booking_custom_fields;
drop policy if exists "Allow public update business profile" on public.business_profile;
drop policy if exists "Allow public read business profile" on public.business_profile;
drop policy if exists "Allow public read businesses" on public.businesses;
drop policy if exists "Allow public delete reservations" on public.reservations;
drop policy if exists "Allow public insert reservations" on public.reservations;
drop policy if exists "Allow public read reservations" on public.reservations;
drop policy if exists "Allow public update reservations" on public.reservations;
drop policy if exists "Allow public update restaurant branding" on public.restaurant_branding;
drop policy if exists "Allow public read restaurant branding" on public.restaurant_branding;
drop policy if exists "Allow public read restaurant settings" on public.restaurant_settings;

create policy "businesses_public_read"
  on public.businesses for select to anon, authenticated using (true);

create policy "business_profile_public_read"
  on public.business_profile for select to anon, authenticated using (true);
create policy "business_profile_manager_insert"
  on public.business_profile for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "business_profile_manager_update"
  on public.business_profile for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "business_profile_manager_delete"
  on public.business_profile for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "restaurant_branding_public_read"
  on public.restaurant_branding for select to anon, authenticated using (true);
create policy "restaurant_branding_manager_insert"
  on public.restaurant_branding for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "restaurant_branding_manager_update"
  on public.restaurant_branding for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "restaurant_branding_manager_delete"
  on public.restaurant_branding for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "restaurant_settings_public_read"
  on public.restaurant_settings for select to anon, authenticated using (true);
create policy "restaurant_settings_manager_insert"
  on public.restaurant_settings for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "restaurant_settings_manager_update"
  on public.restaurant_settings for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "restaurant_settings_manager_delete"
  on public.restaurant_settings for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "booking_custom_fields_public_read"
  on public.booking_custom_fields for select to anon, authenticated
  using (coalesce(is_active, true));
create policy "booking_custom_fields_member_read"
  on public.booking_custom_fields for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "booking_custom_fields_manager_insert"
  on public.booking_custom_fields for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "booking_custom_fields_manager_update"
  on public.booking_custom_fields for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "booking_custom_fields_manager_delete"
  on public.booking_custom_fields for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "reservations_manager_read"
  on public.reservations for select to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "reservations_manager_insert"
  on public.reservations for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "reservations_manager_update"
  on public.reservations for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "reservations_manager_delete"
  on public.reservations for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

-- Availability rows must agree with the selected staff/service tenant. The old
-- policies authorized the user but did not validate these foreign-row relationships.
drop policy if exists "availability_rules_insert" on public.availability_rules;
drop policy if exists "availability_rules_update" on public.availability_rules;
drop policy if exists "availability_exceptions_insert" on public.availability_exceptions;
drop policy if exists "availability_exceptions_update" on public.availability_exceptions;

create policy "availability_rules_insert"
  on public.availability_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.business_id = business_id
        and (
          (select private.has_business_role(business_id, array['owner', 'manager']))
          or staff.user_id = (select auth.uid())
        )
        and (
          service_id is null or exists (
            select 1 from public.staff_services assignment
            join public.services service on service.id = assignment.service_id
            where assignment.staff_id = staff.id and assignment.service_id = service_id
              and assignment.is_active and service.business_id = business_id
          )
        )
    )
  );
create policy "availability_rules_update"
  on public.availability_rules for update to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (select 1 from public.staff_members staff where staff.id = staff_id and staff.user_id = (select auth.uid()))
  )
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.business_id = business_id
        and ((select private.has_business_role(business_id, array['owner', 'manager'])) or staff.user_id = (select auth.uid()))
        and (service_id is null or exists (
          select 1 from public.staff_services assignment
          join public.services service on service.id = assignment.service_id
          where assignment.staff_id = staff.id and assignment.service_id = service_id
            and assignment.is_active and service.business_id = business_id
        ))
    )
  );

create policy "availability_exceptions_insert"
  on public.availability_exceptions for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.business_id = business_id
        and ((select private.has_business_role(business_id, array['owner', 'manager'])) or staff.user_id = (select auth.uid()))
        and (service_id is null or exists (
          select 1 from public.staff_services assignment
          join public.services service on service.id = assignment.service_id
          where assignment.staff_id = staff.id and assignment.service_id = service_id
            and assignment.is_active and service.business_id = business_id
        ))
    )
  );
create policy "availability_exceptions_update"
  on public.availability_exceptions for update to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (select 1 from public.staff_members staff where staff.id = staff_id and staff.user_id = (select auth.uid()))
  )
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.business_id = business_id
        and ((select private.has_business_role(business_id, array['owner', 'manager'])) or staff.user_id = (select auth.uid()))
        and (service_id is null or exists (
          select 1 from public.staff_services assignment
          join public.services service on service.id = assignment.service_id
          where assignment.staff_id = staff.id and assignment.service_id = service_id
            and assignment.is_active and service.business_id = business_id
        ))
    )
  );

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
    select p_party_size > 0
      and p_reservation_time >= settings.opening_time
      and p_reservation_time < settings.closing_time
      and coalesce(sum(reservation.party_size) filter (where reservation.status = 'confirmed'), 0) + p_party_size <= settings.max_guests_per_slot
    from public.businesses business
    join public.restaurant_settings settings on settings.business_id = business.id
    left join public.reservations reservation
      on reservation.business_id = business.id
     and reservation.reservation_date = p_reservation_date
     and reservation.reservation_time = p_reservation_time
    where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    group by settings.id
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
  v_opening_time time;
  v_closing_time time;
  v_capacity integer;
  v_reserved integer;
  v_prefix text;
  v_reference text;
begin
  if nullif(btrim(p_customer_name), '') is null or nullif(btrim(p_phone), '') is null
    or p_party_size < 1 or p_party_size > 100 then
    raise exception 'Valid customer details and party size are required' using errcode = '22023';
  end if;
  if p_reservation_date < current_date or p_reservation_date > current_date + 730 then
    raise exception 'Reservation date is outside the allowed range' using errcode = '22023';
  end if;

  select business.id, settings.opening_time, settings.closing_time,
    settings.max_guests_per_slot, coalesce(profile.reference_prefix, 'REF')
  into v_business_id, v_opening_time, v_closing_time, v_capacity, v_prefix
  from public.businesses business
  join public.restaurant_settings settings on settings.business_id = business.id
  left join public.business_profile profile on profile.business_id = business.id
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''));

  if v_business_id is null then
    raise exception 'Booking business not found' using errcode = 'P0002';
  end if;
  if p_reservation_time < v_opening_time or p_reservation_time >= v_closing_time then
    raise exception 'The requested time is outside opening hours' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended(v_business_id::text || ':' || p_reservation_date::text || ':' || p_reservation_time::text, 0)
  );
  select coalesce(sum(party_size), 0)::integer into v_reserved
  from public.reservations
  where business_id = v_business_id and reservation_date = p_reservation_date
    and reservation_time = p_reservation_time and status = 'confirmed';
  if v_reserved + p_party_size > v_capacity then
    raise exception 'This time slot no longer has enough capacity' using errcode = '23P01';
  end if;

  v_reference := upper(left(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'), 6))
    || '-' || to_char(p_reservation_date, 'YYYYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.reservations (
    business_id, customer_name, phone, reservation_date, reservation_time,
    party_size, special_request, reservation_reference, custom_data
  ) values (
    v_business_id, left(btrim(p_customer_name), 200), left(btrim(p_phone), 50),
    p_reservation_date, p_reservation_time, p_party_size,
    nullif(left(btrim(p_special_request), 2000), ''), v_reference,
    coalesce(p_custom_data, '{}'::jsonb)
  );
  return v_reference;
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
  if nullif(btrim(p_reservation_reference), '') is null or nullif(btrim(p_phone), '') is null then
    return false;
  end if;
  update public.reservations reservation
  set status = 'cancelled'
  from public.businesses business
  where reservation.business_id = business.id
    and lower(business.business_slug) = lower(btrim(p_business_slug))
    and reservation.reservation_reference = btrim(p_reservation_reference)
    and regexp_replace(reservation.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
    and reservation.status = 'confirmed';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Explicit grants: RLS controls rows, grants control whether a table/API is reachable.
revoke all on all tables in schema public from anon;
grant select on public.businesses, public.business_profile, public.restaurant_branding,
  public.restaurant_settings, public.booking_custom_fields, public.services,
  public.staff_services to anon;
grant select (id, business_id, display_name, slug, bio, photo_url, timezone, is_active, is_published)
  on public.staff_members to anon;
grant select (id, business_id, service_id, staff_id, starts_at, ends_at, capacity, status, is_published)
  on public.scheduled_sessions to anon;

revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on public.business_memberships, public.business_profile,
  public.restaurant_branding, public.restaurant_settings, public.booking_custom_fields,
  public.reservations, public.resources, public.services, public.staff_members,
  public.staff_services, public.availability_rules, public.availability_exceptions,
  public.bookings to authenticated;
grant select on public.businesses, public.scheduled_sessions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.check_public_restaurant_availability(text,date,time,integer) from public, anon, authenticated;
revoke all on function public.create_public_restaurant_reservation(text,text,text,date,time,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.cancel_public_restaurant_reservation(text,text,text) from public, anon, authenticated;
grant execute on function public.check_public_restaurant_availability(text,date,time,integer) to anon, authenticated;
grant execute on function public.create_public_restaurant_reservation(text,text,text,date,time,integer,text,jsonb) to anon, authenticated;
grant execute on function public.cancel_public_restaurant_reservation(text,text,text) to anon, authenticated;

-- Event-trigger helpers are never client APIs.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Adopt explicit grants for future public-schema objects ahead of Supabase's
-- October 2026 Data API default change.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

