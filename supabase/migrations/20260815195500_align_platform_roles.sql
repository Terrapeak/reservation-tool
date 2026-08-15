-- Align Reservations membership roles with TerraPeak CompanyMembership roles.
-- TerraPeak remains the source of truth. Reservations keeps a compatible mirror
-- only for row-level security while the direct Supabase customer login is retired.

alter table public.business_memberships
  drop constraint if exists business_memberships_role_check;

alter table public.business_memberships
  add constraint business_memberships_role_check
  check (role in ('owner', 'admin', 'manager', 'staff', 'viewer'));

create or replace function private.has_business_role(
  requested_business_id bigint,
  allowed_roles text[] default array['owner', 'admin', 'manager', 'staff', 'viewer']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = requested_business_id
      and membership.user_id = (select auth.uid())
      and (
        membership.role = any(allowed_roles)
        or (
          membership.role = 'admin'
          and 'manager' = any(allowed_roles)
        )
      )
  );
$$;

revoke all on function private.has_business_role(bigint, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_business_role(bigint, text[]) to authenticated;

comment on column public.business_memberships.role is
  'Compatibility mirror of TerraPeak CompanyMembership roles: owner, admin, manager, staff, viewer. TerraPeak CompanyMembership is authoritative.';

comment on function private.has_business_role(bigint, text[]) is
  'Checks mirrored TerraPeak company role access. Admin inherits manager-level Reservations capabilities; default membership reads include viewer.';
