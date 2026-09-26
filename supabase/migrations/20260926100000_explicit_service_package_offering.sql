alter table public.services
  add column if not exists offer_as_package boolean not null default false;

comment on column public.services.offer_as_package is
  'This service may be displayed to customers as a package offering. This does not represent purchase, entitlement, payment, redemption, or customer package ownership.';

alter table public.services
  drop constraint if exists services_offer_as_package_sessions_check,
  add constraint services_offer_as_package_sessions_check
    check (not offer_as_package or price_session_count >= 2);

update public.services service
set offer_as_package = true
from public.reservation_business_settings settings
where settings.business_id = service.business_id
  and settings.capabilities @> '{"packages": true}'::jsonb
  and (service.price_session_count > 1 or service.package_validity_days is not null)
  and service.offer_as_package is distinct from true;

create or replace function public.create_class_service_setup_v3(
  p_business_id bigint,p_name text,p_slug text,p_subject text,p_description text,p_booking_type text,
  p_capacity integer,p_price numeric,p_currency text,p_price_session_count integer,p_package_validity_days integer,
  p_offer_as_package boolean,p_start_date date,p_end_date date,p_number_of_weeks integer,p_open_ended boolean,
  p_is_published boolean,p_schedule jsonb
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_service_id bigint;
begin
  if p_offer_as_package and p_price_session_count < 2 then
    raise exception 'Package offerings must cover at least two sessions' using errcode='22023';
  end if;
  v_service_id := public.create_class_service_setup_v2(
    p_business_id,p_name,p_slug,p_subject,p_description,p_booking_type,p_capacity,p_price,p_currency,
    p_price_session_count,p_package_validity_days,p_start_date,p_end_date,p_number_of_weeks,p_open_ended,
    p_is_published,p_schedule
  );
  update public.services set offer_as_package = coalesce(p_offer_as_package, false) where id = v_service_id;
  return v_service_id;
end;
$$;

create or replace function public.update_class_service_setup_v3(
  p_service_id bigint,p_name text,p_slug text,p_subject text,p_description text,p_capacity integer,p_price numeric,
  p_price_session_count integer,p_package_validity_days integer,p_offer_as_package boolean,p_start_date date,
  p_end_date date,p_number_of_weeks integer,p_open_ended boolean,p_apply_from date,p_is_published boolean,p_schedule jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare v_created integer;
begin
  if p_offer_as_package and p_price_session_count < 2 then
    raise exception 'Package offerings must cover at least two sessions' using errcode='22023';
  end if;
  v_created := public.update_class_service_setup_v2(
    p_service_id,p_name,p_slug,p_subject,p_description,p_capacity,p_price,p_price_session_count,
    p_package_validity_days,p_start_date,p_end_date,p_number_of_weeks,p_open_ended,p_apply_from,
    p_is_published,p_schedule
  );
  update public.services set offer_as_package = coalesce(p_offer_as_package, false) where id = p_service_id;
  return v_created;
end;
$$;

revoke all on function public.create_class_service_setup_v3(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,boolean,date,date,integer,boolean,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.create_class_service_setup_v3(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,boolean,date,date,integer,boolean,boolean,jsonb) to authenticated;

revoke all on function public.update_class_service_setup_v3(bigint,text,text,text,text,integer,numeric,integer,integer,boolean,date,date,integer,boolean,date,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.update_class_service_setup_v3(bigint,text,text,text,text,integer,numeric,integer,integer,boolean,date,date,integer,boolean,date,boolean,jsonb) to authenticated;
