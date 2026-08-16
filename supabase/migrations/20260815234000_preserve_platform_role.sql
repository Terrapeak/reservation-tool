-- Preserve the canonical TerraPeak CompanyMembership role separately from the
-- legacy operational role consumed by the current Reservations UI.
-- TerraPeak CompanyMembership remains authoritative.

alter table public.business_memberships
  add column if not exists platform_role text;

update public.business_memberships
set platform_role = role
where platform_role is null;

alter table public.business_memberships
  drop constraint if exists business_memberships_platform_role_check;

alter table public.business_memberships
  add constraint business_memberships_platform_role_check
  check (platform_role in ('owner', 'admin', 'manager', 'staff', 'viewer'));

comment on column public.business_memberships.platform_role is
  'Canonical TerraPeak CompanyMembership role mirrored for Reservations authorization context.';

comment on column public.business_memberships.role is
  'Reservations compatibility role used by legacy UI/RLS during Platform migration. Do not treat as TerraPeak source of truth.';
