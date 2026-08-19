create function public.restore_archived_service(p_service_id bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_business_id bigint;
begin
  select business_id into v_business_id from public.services where id=p_service_id and not is_active;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then
    raise exception 'Archived service not found or access denied' using errcode='42501';
  end if;
  update public.services set is_active=true,is_published=false,updated_at=now() where id=p_service_id;
end $$;

revoke all on function public.restore_archived_service(bigint) from public,anon,authenticated;
grant execute on function public.restore_archived_service(bigint) to authenticated;
