-- TerraPeak integration stabilization
-- Customer tenants must be provisioned by the TerraPeak Platform installer.
-- Keep the function definition for migration compatibility, but remove client execution.

revoke all on function public.create_owner_business(text,text,text,text)
  from public, anon, authenticated;

comment on function public.create_owner_business(text,text,text,text) is
  'Disabled for client use. Reservations tenants must be provisioned through the TerraPeak Platform installer.';
