alter table public.booking_custom_fields
  add column if not exists system_key text,
  add column if not exists is_locked boolean not null default false;

create unique index if not exists booking_custom_fields_business_system_key_key
  on public.booking_custom_fields (business_id, system_key)
  where system_key is not null;

update public.booking_custom_fields
set display_order = coalesce(display_order, 1) + 30
where system_key is null
  and not exists (
    select 1 from public.booking_custom_fields existing
    where existing.business_id = booking_custom_fields.business_id
      and existing.system_key is not null
  );

insert into public.booking_custom_fields
  (business_id, field_label, field_type, is_required, display_order, is_active, system_key, is_locked)
select id, 'Full name', 'text', true, 10, true, 'name', true
from public.businesses
on conflict (business_id, system_key) where system_key is not null do nothing;

insert into public.booking_custom_fields
  (business_id, field_label, field_type, is_required, display_order, is_active, system_key, is_locked)
select id, 'Phone', 'text', true, 20, true, 'phone', true
from public.businesses
on conflict (business_id, system_key) where system_key is not null do nothing;

insert into public.booking_custom_fields
  (business_id, field_label, field_type, is_required, display_order, is_active, system_key, is_locked)
select id, 'Email', 'text', false, 30, true, 'email', false
from public.businesses
on conflict (business_id, system_key) where system_key is not null do nothing;

create table if not exists public.reservation_business_settings (
  business_id bigint primary key references public.businesses(id) on delete cascade,
  timezone text not null default 'Asia/Kuala_Lumpur',
  booking_behavior text not null default 'immediate'
    check (booking_behavior in ('immediate', 'request')),
  confirmation_message text not null default 'Your booking request has been received.',
  module_appointments boolean not null default true,
  module_scheduled boolean not null default false,
  module_packages boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservation_business_settings enable row level security;

drop policy if exists reservation_business_settings_public_read on public.reservation_business_settings;
create policy reservation_business_settings_public_read
on public.reservation_business_settings for select
using (true);

drop policy if exists reservation_business_settings_manager_insert on public.reservation_business_settings;
create policy reservation_business_settings_manager_insert
on public.reservation_business_settings for insert
with check ((select private.has_business_role(business_id, array['owner','manager'])));

drop policy if exists reservation_business_settings_manager_update on public.reservation_business_settings;
create policy reservation_business_settings_manager_update
on public.reservation_business_settings for update
using ((select private.has_business_role(business_id, array['owner','manager'])))
with check ((select private.has_business_role(business_id, array['owner','manager'])));

drop policy if exists reservation_business_settings_manager_delete on public.reservation_business_settings;
create policy reservation_business_settings_manager_delete
on public.reservation_business_settings for delete
using ((select private.has_business_role(business_id, array['owner','manager'])));

insert into public.reservation_business_settings (business_id)
select id from public.businesses
on conflict (business_id) do nothing;