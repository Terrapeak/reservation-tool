-- Reusable staff qualifications plus atomic recurring-series and bulk session management.

alter table public.services add column if not exists subject text;

create table if not exists public.staff_subjects (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  staff_id bigint not null references public.staff_members(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists staff_subjects_unique_idx on public.staff_subjects (staff_id, lower(subject));
create index if not exists staff_subjects_business_subject_idx on public.staff_subjects (business_id, lower(subject));
alter table public.staff_subjects enable row level security;
create policy "staff_subjects_member_read" on public.staff_subjects for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "staff_subjects_manager_manage" on public.staff_subjects for all to authenticated
  using ((select private.has_business_role(business_id,array['owner','manager'])))
  with check ((select private.has_business_role(business_id,array['owner','manager'])));
grant select,insert,update,delete on public.staff_subjects to authenticated;
grant usage,select on sequence public.staff_subjects_id_seq to authenticated;

update public.services set subject = nullif(btrim(regexp_replace(name,'\s+(class|course|training)(\s+.*)?$','','i')),'')
where subject is null and booking_type in ('class','course');
insert into public.staff_subjects (business_id,staff_id,subject)
select distinct s.business_id,ss.staff_id,s.subject from public.staff_services ss join public.services s on s.id=ss.service_id
where ss.is_active and s.subject is not null
on conflict do nothing;

create or replace function public.set_staff_subjects(p_staff_id bigint,p_subjects text[])
returns void language plpgsql security definer set search_path='' as $$
declare v_business_id bigint; v_subject text;
begin
  select business_id into v_business_id from public.staff_members where id=p_staff_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then
    raise exception 'Staff member not found or access denied' using errcode='42501';
  end if;
  delete from public.staff_subjects where staff_id=p_staff_id;
  foreach v_subject in array coalesce(p_subjects,array[]::text[]) loop
    if nullif(btrim(v_subject),'') is not null then
      insert into public.staff_subjects(business_id,staff_id,subject) values(v_business_id,p_staff_id,left(btrim(v_subject),100)) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.create_class_service_setup_v2(
  p_business_id bigint,p_name text,p_slug text,p_subject text,p_description text,p_booking_type text,
  p_capacity integer,p_price numeric,p_currency text,p_price_session_count integer,p_package_validity_days integer,
  p_start_date date,p_end_date date,p_number_of_weeks integer,p_open_ended boolean,p_is_published boolean,p_schedule jsonb
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_service_id bigint;
begin
  if nullif(btrim(p_subject),'') is null then raise exception 'Subject is required' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_schedule) loop
    if not exists(select 1 from public.staff_subjects ss where ss.staff_id=(v_item->>'staff_id')::bigint and ss.business_id=p_business_id and lower(ss.subject)=lower(btrim(p_subject))) then
      raise exception 'Every selected teacher must be qualified for %',btrim(p_subject) using errcode='22023';
    end if;
  end loop;
  v_service_id:=public.create_class_service_setup(p_business_id,p_name,p_slug,p_description,p_booking_type,p_capacity,p_price,p_currency,p_price_session_count,p_package_validity_days,p_start_date,p_end_date,p_number_of_weeks,p_open_ended,p_is_published,p_schedule);
  update public.services set subject=btrim(p_subject) where id=v_service_id;
  return v_service_id;
end $$;

create or replace function public.bulk_cancel_scheduled_sessions(p_session_ids bigint[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if p_session_ids is null or cardinality(p_session_ids)=0 then return 0; end if;
  if exists(select 1 from public.scheduled_sessions s where s.id=any(p_session_ids) and not (select private.has_business_role(s.business_id,array['owner','manager']))) then
    raise exception 'One or more sessions could not be accessed' using errcode='42501';
  end if;
  update public.scheduled_sessions set status='cancelled',is_published=false,updated_at=now()
    where id=any(p_session_ids) and status='scheduled';
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.update_cohort_schedule_series(
  p_pattern_id uuid,p_staff_id bigint,p_starts_at time,p_ends_at time,p_apply_from date
) returns integer language plpgsql security definer set search_path='' as $$
declare v_pattern public.service_schedule_patterns%rowtype; v_service public.services%rowtype; v_old_tz text; v_new_tz text; v_session record; v_start timestamptz; v_end timestamptz; v_count integer:=0;
begin
  select * into v_pattern from public.service_schedule_patterns where id=p_pattern_id and is_active;
  if v_pattern.id is null or not (select private.has_business_role(v_pattern.business_id,array['owner','manager'])) then raise exception 'Recurring series not found or access denied' using errcode='42501'; end if;
  if p_ends_at<=p_starts_at then raise exception 'End time must be after start time' using errcode='22023'; end if;
  select * into v_service from public.services where id=v_pattern.service_id;
  if not exists(select 1 from public.staff_subjects ss where ss.staff_id=p_staff_id and ss.business_id=v_pattern.business_id and lower(ss.subject)=lower(v_service.subject)) then
    raise exception 'The selected teacher is not qualified for this subject' using errcode='22023';
  end if;
  select timezone into v_old_tz from public.staff_members where id=v_pattern.staff_id;
  select timezone into v_new_tz from public.staff_members where id=p_staff_id and is_active;
  if v_new_tz is null then raise exception 'The selected teacher is unavailable' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(42002,hashtext(p_pattern_id::text));
  insert into public.staff_services(staff_id,service_id,is_active) values(p_staff_id,v_pattern.service_id,true)
    on conflict(staff_id,service_id) do update set is_active=true;
  for v_session in select * from public.scheduled_sessions where series_id=p_pattern_id and status='scheduled' and (starts_at at time zone v_old_tz)::date>=coalesce(p_apply_from,current_date) order by starts_at loop
    v_start:=(((v_session.starts_at at time zone v_old_tz)::date+p_starts_at) at time zone v_new_tz);
    v_end:=v_start+(p_ends_at-p_starts_at);
    update public.scheduled_sessions set staff_id=p_staff_id,starts_at=v_start,ends_at=v_end,
      occupied_starts_at=v_start-make_interval(mins=>v_service.buffer_before_minutes),occupied_ends_at=v_end+make_interval(mins=>v_service.buffer_after_minutes),updated_at=now()
      where id=v_session.id;
    v_count:=v_count+1;
  end loop;
  update public.service_schedule_patterns set staff_id=p_staff_id,starts_at=p_starts_at,ends_at=p_ends_at,updated_at=now() where id=p_pattern_id;
  return v_count;
exception when exclusion_violation then raise exception 'The teacher already has a booking or class during one of the new times' using errcode='23P01';
end $$;

revoke all on function public.set_staff_subjects(bigint,text[]) from public,anon,authenticated;
revoke all on function public.create_class_service_setup_v2(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.bulk_cancel_scheduled_sessions(bigint[]) from public,anon,authenticated;
revoke all on function public.update_cohort_schedule_series(uuid,bigint,time,time,date) from public,anon,authenticated;
grant execute on function public.set_staff_subjects(bigint,text[]) to authenticated;
grant execute on function public.create_class_service_setup_v2(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) to authenticated;
grant execute on function public.bulk_cancel_scheduled_sessions(bigint[]) to authenticated;
grant execute on function public.update_cohort_schedule_series(uuid,bigint,time,time,date) to authenticated;
