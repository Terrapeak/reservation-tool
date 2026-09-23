-- Patch 4B.2A.3: use Supabase's compatibility helper for service-role detection.
-- The existing trigger continues to enforce the same Platform/legacy boundary.

create or replace function private.enforce_reservation_template_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := '';
  claims_text text;
begin
  -- Prefer the legacy single-role setting when present for compatibility.
  request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  -- Parse the current JSON claims inside a guarded block. A malformed request
  -- context must fail closed without aborting the governance trigger.
  if request_role = '' then
    claims_text := nullif(current_setting('request.jwt.claims', true), '');
    if claims_text is not null then
      begin
        request_role := coalesce((claims_text::jsonb ->> 'role'), '');
      exception
        when others then
          request_role := '';
      end;
    end if;
  end if;

  if request_role = 'service_role' then
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

comment on function private.enforce_reservation_template_authority() is
  'Allows service-role Platform synchronization, keeps legacy rows customer-managed, and protects Platform-governed Reservations fields.';
