-- Phase 1 containment: authenticated Reservations users must only read tenant
-- configuration for businesses they are assigned to. Public booking remains
-- available to anonymous visitors while the legacy public form is still in use.

-- Businesses: anonymous users retain legacy public routing visibility for now,
-- but authenticated users may only see businesses where they hold a membership.
drop policy if exists "businesses_public_read" on public.businesses;
drop policy if exists "businesses_anon_read" on public.businesses;
drop policy if exists "businesses_member_read" on public.businesses;

create policy "businesses_anon_read"
  on public.businesses for select to anon
  using (true);

create policy "businesses_member_read"
  on public.businesses for select to authenticated
  using ((select private.has_business_role(id)));

-- Business profile: public booking can read publishable profile data anonymously;
-- signed-in administration is restricted to the active user's tenant memberships.
drop policy if exists "business_profile_public_read" on public.business_profile;
drop policy if exists "business_profile_anon_read" on public.business_profile;
drop policy if exists "business_profile_member_read" on public.business_profile;

create policy "business_profile_anon_read"
  on public.business_profile for select to anon
  using (true);

create policy "business_profile_member_read"
  on public.business_profile for select to authenticated
  using ((select private.has_business_role(business_id)));

-- Branding follows the same containment rule.
drop policy if exists "restaurant_branding_public_read" on public.restaurant_branding;
drop policy if exists "restaurant_branding_anon_read" on public.restaurant_branding;
drop policy if exists "restaurant_branding_member_read" on public.restaurant_branding;

create policy "restaurant_branding_anon_read"
  on public.restaurant_branding for select to anon
  using (true);

create policy "restaurant_branding_member_read"
  on public.restaurant_branding for select to authenticated
  using ((select private.has_business_role(business_id)));

-- Restaurant settings remain readable by anonymous public booking pages, while
-- authenticated users are tenant-scoped.
drop policy if exists "restaurant_settings_public_read" on public.restaurant_settings;
drop policy if exists "restaurant_settings_anon_read" on public.restaurant_settings;
drop policy if exists "restaurant_settings_member_read" on public.restaurant_settings;

create policy "restaurant_settings_anon_read"
  on public.restaurant_settings for select to anon
  using (true);

create policy "restaurant_settings_member_read"
  on public.restaurant_settings for select to authenticated
  using ((select private.has_business_role(business_id)));

-- Active custom fields can still render on anonymous booking pages. Authenticated
-- access is provided by the existing tenant-aware member policy.
drop policy if exists "booking_custom_fields_public_read" on public.booking_custom_fields;
drop policy if exists "booking_custom_fields_anon_read" on public.booking_custom_fields;

create policy "booking_custom_fields_anon_read"
  on public.booking_custom_fields for select to anon
  using (coalesce(is_active, true));

comment on policy "businesses_member_read" on public.businesses is
  'Authenticated users can only read Reservations businesses where they hold a business membership.';
