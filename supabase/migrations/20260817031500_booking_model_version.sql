alter table public.businesses
  add column if not exists booking_model_version smallint not null default 1;

comment on column public.businesses.booking_model_version is
  'Reservations booking storage model version. Version 1 may read legacy reservations; version 2 uses canonical bookings only.';

-- TerraPeak production history has been migrated to public.bookings with the
-- original reservation UUID/reference retained and migration metadata stored in
-- custom_data. Mark it canonical-only so application reads no longer depend on
-- the legacy reservations table for this tenant.
update public.businesses
set booking_model_version = 2
where business_slug = 'terrapeak';
