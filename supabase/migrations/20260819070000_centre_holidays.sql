-- Centre-wide closures for learning centres. A closure becomes an unavailable
-- exception for every active teacher and cancels unbooked scheduled sessions.

create table if not exists public.centre_holidays (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (length(btrim(reason)) between 1 and 300),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists centre_holidays_business_dates_idx on public.centre_holidays(business_id,starts_on,ends_on);
alter table public.centre_holidays enable row level security;
create policy "centre_holidays_member_read" on public.centre_holidays for select to authenticated
  using ((select private.has_business_role(business_id)));
grant select on public.centre_holidays to authenticated;

create function public.create_centre_holiday(p_business_id bigint,p_starts_on date,p_ends_on date,p_reason text)
returns table(holiday_id bigint,sessions_cancelled integer) language plpgsql security definer set search_path='' as $$
declare v_holiday_id bigint; v_staff record; v_cancelled integer:=0;
begin
  if not (select private.has_business_role(p_business_id,array['owner','manager'])) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then raise exception 'Enter a valid holiday date range' using errcode='22023'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Holiday name or reason is required' using errcode='22023'; end if;
  if exists(
    select 1 from public.scheduled_sessions s join public.staff_members sm on sm.id=s.staff_id
    join public.bookings b on b.scheduled_session_id=s.id and b.status in ('pending','confirmed')
    where s.business_id=p_business_id and s.status='scheduled'
      and (s.starts_at at time zone sm.timezone)::date between p_starts_on and p_ends_on
  ) then raise exception 'One or more affected classes has active registrations. Contact those customers and cancel their registrations first.' using errcode='23514'; end if;
  insert into public.centre_holidays(business_id,starts_on,ends_on,reason)
  values(p_business_id,p_starts_on,p_ends_on,btrim(p_reason)) returning id into v_holiday_id;
  for v_staff in select id,timezone from public.staff_members where business_id=p_business_id and is_active loop
    insert into public.availability_exceptions(business_id,staff_id,starts_at,ends_at,exception_type,reason)
    values(p_business_id,v_staff.id,(p_starts_on::timestamp at time zone v_staff.timezone),((p_ends_on+1)::timestamp at time zone v_staff.timezone),'unavailable','Centre holiday: '||btrim(p_reason));
  end loop;
  update public.scheduled_sessions s set status='cancelled',is_published=false,updated_at=now()
  from public.staff_members sm where sm.id=s.staff_id and s.business_id=p_business_id and s.status='scheduled'
    and (s.starts_at at time zone sm.timezone)::date between p_starts_on and p_ends_on;
  get diagnostics v_cancelled=row_count;
  return query select v_holiday_id,v_cancelled;
end $$;

create function public.remove_centre_holiday(p_holiday_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare v_row public.centre_holidays%rowtype;
begin
  select * into v_row from public.centre_holidays where id=p_holiday_id;
  if v_row.id is null or not (select private.has_business_role(v_row.business_id,array['owner','manager'])) then raise exception 'Holiday not found or access denied' using errcode='42501'; end if;
  delete from public.availability_exceptions where business_id=v_row.business_id and reason='Centre holiday: '||v_row.reason
    and starts_at::date between v_row.starts_on-1 and v_row.ends_on+1;
  delete from public.centre_holidays where id=p_holiday_id;
end $$;

revoke all on function public.create_centre_holiday(bigint,date,date,text) from public,anon,authenticated;
revoke all on function public.remove_centre_holiday(bigint) from public,anon,authenticated;
grant execute on function public.create_centre_holiday(bigint,date,date,text) to authenticated;
grant execute on function public.remove_centre_holiday(bigint) to authenticated;
