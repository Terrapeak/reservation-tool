drop function if exists public.get_public_booking_custom_fields(text);

create function public.get_public_booking_custom_fields(p_business_slug text)
returns table(
  id bigint,
  field_label text,
  field_type text,
  field_options text,
  is_required boolean,
  display_order integer,
  system_key text,
  field_source text,
  template_key text,
  template_field_key text
)
language sql
security definer
set search_path = ''
as $$
  select f.id, f.field_label, f.field_type, f.field_options, f.is_required,
         f.display_order, f.system_key, f.field_source, f.template_key,
         f.template_field_key
  from public.booking_custom_fields f
  join public.businesses b on b.id = f.business_id
  where lower(b.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and f.is_active = true
  order by f.display_order, f.id;
$$;

revoke all on function public.get_public_booking_custom_fields(text) from public;
grant execute on function public.get_public_booking_custom_fields(text) to anon, authenticated;
