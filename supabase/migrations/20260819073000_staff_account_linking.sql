alter table public.staff_members add column if not exists login_email text;
create unique index if not exists staff_members_business_login_email_idx
  on public.staff_members(business_id,lower(login_email)) where login_email is not null;

create function public.set_staff_login_email(p_staff_id bigint,p_login_email text) returns void
language plpgsql security definer set search_path='' as $$
declare v_business_id bigint; v_email text:=nullif(lower(btrim(p_login_email)),'');
begin
  select business_id into v_business_id from public.staff_members where id=p_staff_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Staff member not found or access denied' using errcode='42501'; end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid TerraPeak login email' using errcode='22023'; end if;
  update public.staff_members set login_email=v_email,user_id=case when login_email is distinct from v_email then null else user_id end,updated_at=now() where id=p_staff_id;
end $$;
revoke all on function public.set_staff_login_email(bigint,text) from public,anon,authenticated;
grant execute on function public.set_staff_login_email(bigint,text) to authenticated;
