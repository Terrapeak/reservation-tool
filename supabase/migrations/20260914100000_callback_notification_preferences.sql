-- Phase D1: canonical callback notification preference.
-- Missing/NULL values remain enabled through the application fallback.
alter table public.reservation_business_settings
  add column if not exists callback_notifications jsonb not null
    default '{"enabled": true, "recipient_mode": "owner_admin"}'::jsonb;

alter table public.reservation_business_settings
  drop constraint if exists reservation_business_settings_callback_notifications_check;

alter table public.reservation_business_settings
  add constraint reservation_business_settings_callback_notifications_check
  check (
    jsonb_typeof(callback_notifications) = 'object'
    and coalesce((callback_notifications->>'enabled')::boolean, true) in (true, false)
    and coalesce(callback_notifications->>'recipient_mode', 'owner_admin') = 'owner_admin'
  );

comment on column public.reservation_business_settings.callback_notifications is
  'Canonical callback email policy. Phase D1 supports enabled and owner_admin only.';

