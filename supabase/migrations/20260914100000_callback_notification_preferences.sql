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
    and (
      not (callback_notifications ? 'enabled')
      or jsonb_typeof(callback_notifications->'enabled') = 'boolean'
    )
    and (
      not (callback_notifications ? 'recipient_mode')
      or (
        jsonb_typeof(callback_notifications->'recipient_mode') = 'string'
        and callback_notifications->>'recipient_mode' = 'owner_admin'
      )
    )
  );

comment on column public.reservation_business_settings.callback_notifications is
  'Canonical callback email policy. Phase D1 supports enabled and owner_admin only.';

-- Keep the existing manager-level row permissions for unrelated settings, but
-- protect this sensitive preference at the column-change boundary. The
-- canonical default is safe for manager-created rows; selecting any other
-- value requires owner/admin membership authority.
create or replace function private.enforce_callback_notification_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_default jsonb := '{"enabled": true, "recipient_mode": "owner_admin"}'::jsonb;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.callback_notifications is not distinct from old.callback_notifications then
    return new;
  end if;

  if tg_op = 'INSERT' and new.callback_notifications = canonical_default then
    return new;
  end if;

  if not (select private.has_business_role(new.business_id, array['owner', 'admin'])) then
    raise exception 'Only business owners and admins may change callback notification preferences'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_callback_notification_authorization() from public, anon, authenticated;

drop trigger if exists reservation_business_settings_callback_notification_authorization
  on public.reservation_business_settings;
create trigger reservation_business_settings_callback_notification_authorization
before insert or update of callback_notifications
on public.reservation_business_settings
for each row execute function private.enforce_callback_notification_authorization();

comment on function private.enforce_callback_notification_authorization() is
  'Allows service-role writes and canonical defaults, while requiring owner/admin membership for callback preference changes.';

