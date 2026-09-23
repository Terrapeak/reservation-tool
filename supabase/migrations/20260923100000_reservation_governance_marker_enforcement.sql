-- Patch 4B.2A.2: distinguish Platform-managed capability configuration from
-- legacy tenant-managed configuration and enforce that boundary in Postgres.

alter table public.reservation_business_settings
  add column if not exists capabilities_managed_by_platform boolean not null default false;

comment on column public.reservation_business_settings.capabilities_managed_by_platform is
  'When true, TerraPeak controls template_key, capabilities, and terminology. Existing rows remain legacy/customer-managed by default.';

create or replace function private.enforce_reservation_template_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The backend uses the Supabase service role for Platform synchronization.
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.capabilities_managed_by_platform is true then
      raise exception 'Reservations capabilities are controlled by the TerraPeak template.'
        using errcode = '42501';
    end if;
    new.capabilities_managed_by_platform := false;
    return new;
  end if;

  if old.capabilities_managed_by_platform is true then
    if new.capabilities_managed_by_platform is distinct from old.capabilities_managed_by_platform
       or new.template_key is distinct from old.template_key
       or new.capabilities is distinct from old.capabilities
       or new.terminology is distinct from old.terminology then
      raise exception 'Reservations capabilities are controlled by the TerraPeak template.'
        using errcode = '42501';
    end if;
  elsif new.capabilities_managed_by_platform is true then
    raise exception 'Reservations capabilities are controlled by the TerraPeak template.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_reservation_template_authority() from public, anon, authenticated;
grant execute on function private.enforce_reservation_template_authority() to service_role;

drop trigger if exists reservation_business_settings_template_authority
  on public.reservation_business_settings;
create trigger reservation_business_settings_template_authority
before insert or update of template_key, capabilities, terminology, capabilities_managed_by_platform
on public.reservation_business_settings
for each row execute function private.enforce_reservation_template_authority();

comment on function private.enforce_reservation_template_authority() is
  'Allows service-role Platform synchronization, keeps legacy rows customer-managed, and protects Platform-governed Reservations fields.';
