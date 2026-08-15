-- Targeted follow-up for scheduled sessions. The full legacy RLS audit remains separate.

create index if not exists scheduled_sessions_created_by_idx
  on public.scheduled_sessions (created_by)
  where created_by is not null;

create or replace function public.cancel_scheduled_session(p_session_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
begin
  select business_id into v_business_id
  from public.scheduled_sessions where id = p_session_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id, array['owner', 'manager'])) then
    raise exception 'Session not found or access denied' using errcode = '42501';
  end if;

  update public.scheduled_sessions
  set status = 'cancelled', is_published = false, updated_at = now()
  where id = p_session_id;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where scheduled_session_id = p_session_id
    and status in ('pending', 'confirmed');
end;
$$;

revoke all on function public.create_scheduled_sessions(bigint,bigint,bigint,timestamp,integer,integer,integer,boolean,text) from public, anon, authenticated;
revoke all on function public.cancel_scheduled_session(bigint) from public, anon, authenticated;
revoke all on function public.get_public_scheduled_sessions(text,text,date,date) from public, anon, authenticated;
revoke all on function public.create_public_session_booking(text,text,bigint,text,text,text,text,integer) from public, anon, authenticated;

grant execute on function public.create_scheduled_sessions(bigint,bigint,bigint,timestamp,integer,integer,integer,boolean,text) to authenticated;
grant execute on function public.cancel_scheduled_session(bigint) to authenticated;
grant execute on function public.get_public_scheduled_sessions(text,text,date,date) to anon, authenticated;
grant execute on function public.create_public_session_booking(text,text,bigint,text,text,text,text,integer) to anon, authenticated;
