create function public.permanently_delete_archived_service(p_service_id bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare v_business_id bigint;
begin
  select business_id into v_business_id from public.services where id=p_service_id and not is_active for update;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then
    raise exception 'Archived service not found or access denied' using errcode='42501';
  end if;
  if exists(select 1 from public.bookings where service_id=p_service_id)
    or exists(select 1 from public.class_enrollments where service_id=p_service_id)
    or exists(select 1 from public.scheduled_sessions where service_id=p_service_id) then
    raise exception 'This service has booking, enquiry, or scheduled-session history and must remain archived' using errcode='23503';
  end if;
  delete from public.services where id=p_service_id;
end $$;

revoke all on function public.permanently_delete_archived_service(bigint) from public,anon,authenticated;
grant execute on function public.permanently_delete_archived_service(bigint) to authenticated;
