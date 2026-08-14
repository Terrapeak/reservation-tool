-- Resolve public booking tenants without expanding direct table visibility.

create or replace function public.get_public_booking_business(p_business_slug text)
returns table (
  id bigint,
  business_name text,
  business_slug text,
  business_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select business.id, business.business_name, business.business_slug, business.business_type
  from public.businesses business
  where lower(business.business_slug) = lower(nullif(btrim(p_business_slug), ''))
  limit 1;
$$;

revoke all on function public.get_public_booking_business(text) from public, anon, authenticated;
grant execute on function public.get_public_booking_business(text) to anon, authenticated;

comment on function public.get_public_booking_business(text) is
  'Returns only the public tenant fields required to resolve booking routes for signed-in or anonymous visitors.';
