alter table public.services add column if not exists is_test boolean not null default false;

create or replace function public.archived_service_delete_summary(p_service_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_business_id bigint; v_name text; v_is_test boolean; v_bookings integer; v_enrollments integer; v_sessions integer;
begin
  select business_id,name,is_test into v_business_id,v_name,v_is_test from public.services where id=p_service_id and not is_active;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Archived service not found or access denied' using errcode='42501'; end if;
  select count(*) into v_bookings from public.bookings where service_id=p_service_id;
  select count(*) into v_enrollments from public.class_enrollments where service_id=p_service_id;
  select count(*) into v_sessions from public.scheduled_sessions where service_id=p_service_id;
  return jsonb_build_object('service_name',v_name,'is_test',v_is_test,'bookings',v_bookings,'enrollments',v_enrollments,'sessions',v_sessions,'has_history',(v_bookings+v_enrollments+v_sessions)>0);
end $function$;

create or replace function public.set_service_test_flag(p_service_id bigint,p_is_test boolean)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_business_id bigint;
begin
  select business_id into v_business_id from public.services where id=p_service_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Service not found or access denied' using errcode='42501'; end if;
  update public.services set is_test=coalesce(p_is_test,false),updated_at=now() where id=p_service_id;
end $function$;

create or replace function public.force_delete_archived_service(p_service_id bigint,p_expected_name text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_business_id bigint; v_service_name text; v_booking_count integer; v_enrollment_count integer; v_session_count integer;
begin
  select business_id,name into v_business_id,v_service_name from public.services where id=p_service_id and not is_active for update;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Archived service not found or access denied' using errcode='42501'; end if;
  if p_expected_name is distinct from v_service_name then raise exception 'Service name confirmation does not match' using errcode='22023'; end if;
  select count(*) into v_booking_count from public.bookings where service_id=p_service_id;
  select count(*) into v_enrollment_count from public.class_enrollments where service_id=p_service_id;
  select count(*) into v_session_count from public.scheduled_sessions where service_id=p_service_id;
  delete from public.bookings where service_id=p_service_id;
  delete from public.class_enrollments where service_id=p_service_id;
  delete from public.scheduled_sessions where service_id=p_service_id;
  delete from public.services where id=p_service_id;
  return jsonb_build_object('service_name',v_service_name,'bookings_deleted',v_booking_count,'enrollments_deleted',v_enrollment_count,'sessions_deleted',v_session_count);
end $function$;

revoke all on function public.archived_service_delete_summary(bigint) from public;
revoke all on function public.set_service_test_flag(bigint,boolean) from public;
revoke all on function public.force_delete_archived_service(bigint,text) from public;
grant execute on function public.archived_service_delete_summary(bigint) to authenticated;
grant execute on function public.set_service_test_flag(bigint,boolean) to authenticated;
grant execute on function public.force_delete_archived_service(bigint,text) to authenticated;
