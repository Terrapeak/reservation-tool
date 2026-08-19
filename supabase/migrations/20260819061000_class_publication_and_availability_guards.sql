-- Published classes must have publicly visible teachers and every recurring
-- timetable row must fit inside the selected teacher's weekly availability.

create or replace function private.validate_class_timetable(
  p_business_id bigint,
  p_subject text,
  p_service_id bigint,
  p_is_published boolean,
  p_schedule jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_staff_id bigint; v_day smallint; v_start time; v_end time;
begin
  if jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)=0 then
    raise exception 'Select at least one class day' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_schedule) loop
    v_staff_id:=(v_item->>'staff_id')::bigint; v_day:=(v_item->>'day_of_week')::smallint;
    v_start:=(v_item->>'starts_at')::time; v_end:=(v_item->>'ends_at')::time;
    if v_end<=v_start then raise exception 'Every class end time must be after its start time' using errcode='22023'; end if;
    if not exists(select 1 from public.staff_members sm join public.staff_subjects ss on ss.staff_id=sm.id and ss.business_id=sm.business_id
      where sm.id=v_staff_id and sm.business_id=p_business_id and sm.is_active and lower(ss.subject)=lower(btrim(p_subject))) then
      raise exception 'Every selected teacher must be active and qualified for %',btrim(p_subject) using errcode='22023';
    end if;
    if p_is_published and not exists(select 1 from public.staff_members where id=v_staff_id and business_id=p_business_id and is_published) then
      raise exception 'Publish every selected teacher profile before publishing this class' using errcode='22023';
    end if;
    if not exists(select 1 from public.availability_rules ar where ar.staff_id=v_staff_id and ar.business_id=p_business_id
      and ar.day_of_week=v_day and ar.is_active and ar.start_time<=v_start and ar.end_time>=v_end
      and (ar.service_id is null or ar.service_id=p_service_id)) then
      raise exception 'A selected class time is outside the teacher''s weekly availability' using errcode='22023';
    end if;
  end loop;
end $$;
revoke all on function private.validate_class_timetable(bigint,text,bigint,boolean,jsonb) from public,anon,authenticated;

alter function public.create_class_service_setup_v2(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb)
  rename to create_class_service_setup_v2_unchecked;
revoke all on function public.create_class_service_setup_v2_unchecked(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) from public,anon,authenticated;

create function public.create_class_service_setup_v2(
  p_business_id bigint,p_name text,p_slug text,p_subject text,p_description text,p_booking_type text,
  p_capacity integer,p_price numeric,p_currency text,p_price_session_count integer,p_package_validity_days integer,
  p_start_date date,p_end_date date,p_number_of_weeks integer,p_open_ended boolean,p_is_published boolean,p_schedule jsonb
) returns bigint language plpgsql security definer set search_path='' as $$
begin
  if not (select private.has_business_role(p_business_id,array['owner','manager'])) then raise exception 'Access denied' using errcode='42501'; end if;
  perform private.validate_class_timetable(p_business_id,p_subject,null,p_is_published,p_schedule);
  return public.create_class_service_setup_v2_unchecked(p_business_id,p_name,p_slug,p_subject,p_description,p_booking_type,p_capacity,p_price,p_currency,p_price_session_count,p_package_validity_days,p_start_date,p_end_date,p_number_of_weeks,p_open_ended,p_is_published,p_schedule);
end $$;
revoke all on function public.create_class_service_setup_v2(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.create_class_service_setup_v2(bigint,text,text,text,text,text,integer,numeric,text,integer,integer,date,date,integer,boolean,boolean,jsonb) to authenticated;

alter function public.update_class_service_setup_v2(bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb)
  rename to update_class_service_setup_v2_unchecked;
revoke all on function public.update_class_service_setup_v2_unchecked(bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb) from public,anon,authenticated;

create function public.update_class_service_setup_v2(
  p_service_id bigint,p_name text,p_slug text,p_subject text,p_description text,p_capacity integer,p_price numeric,
  p_price_session_count integer,p_package_validity_days integer,p_start_date date,p_end_date date,p_number_of_weeks integer,
  p_open_ended boolean,p_apply_from date,p_is_published boolean,p_schedule jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare v_business_id bigint;
begin
  select business_id into v_business_id from public.services where id=p_service_id;
  if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Access denied' using errcode='42501'; end if;
  perform private.validate_class_timetable(v_business_id,p_subject,p_service_id,p_is_published,p_schedule);
  return public.update_class_service_setup_v2_unchecked(p_service_id,p_name,p_slug,p_subject,p_description,p_capacity,p_price,p_price_session_count,p_package_validity_days,p_start_date,p_end_date,p_number_of_weeks,p_open_ended,p_apply_from,p_is_published,p_schedule);
end $$;
revoke all on function public.update_class_service_setup_v2(bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.update_class_service_setup_v2(bigint,text,text,text,text,integer,numeric,integer,integer,date,date,integer,boolean,date,boolean,jsonb) to authenticated;
