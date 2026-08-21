create or replace function public.get_public_booking_custom_fields(p_business_slug text)
returns table(
  id bigint,
  field_label text,
  field_type text,
  field_options text,
  is_required boolean,
  display_order integer,
  system_key text
)
language sql
security definer
set search_path = ''
as $$
  select f.id, f.field_label, f.field_type, f.field_options, f.is_required,
         f.display_order, f.system_key
  from public.booking_custom_fields f
  join public.businesses b on b.id = f.business_id
  where lower(b.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and f.is_active = true
  order by f.display_order, f.id;
$$;

revoke all on function public.get_public_booking_custom_fields(text) from public;
grant execute on function public.get_public_booking_custom_fields(text) to anon, authenticated;

create or replace function public.create_public_restaurant_reservation(
  p_business_slug text,
  p_customer_name text,
  p_phone text,
  p_reservation_date date,
  p_reservation_time time without time zone,
  p_party_size integer,
  p_special_request text default null,
  p_custom_data jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
  v_booking public.bookings%rowtype;
  v_customer_email text;
begin
  select id into v_business_id
  from public.businesses
  where lower(business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and booking_model_version = 2;

  if v_business_id is null then
    raise exception 'Reservations are not configured for this business' using errcode = 'P0002';
  end if;

  v_customer_email := nullif(btrim(coalesce(p_custom_data->>'customer_email', '')), '');

  v_booking := public.create_canonical_restaurant_booking(
    v_business_id,
    p_customer_name,
    p_phone,
    p_reservation_date,
    p_reservation_time,
    p_party_size,
    p_special_request,
    coalesce(p_custom_data, '{}'::jsonb),
    v_customer_email
  );

  return v_booking.reference;
end;
$$;

revoke all on function public.create_public_restaurant_reservation(text,text,text,date,time without time zone,integer,text,jsonb) from public;
grant execute on function public.create_public_restaurant_reservation(text,text,text,date,time without time zone,integer,text,jsonb) to anon, authenticated;
