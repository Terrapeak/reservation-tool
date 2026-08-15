-- Secure customer self-service cancellation and rescheduling.
-- Every public management operation requires both the random reference and the
-- normalized phone number; no customer contact details are returned.

create or replace function public.get_public_restaurant_reservation(
  p_business_slug text, p_reservation_reference text, p_phone text
) returns table(
  reservation_date date, reservation_time time, party_size integer, status text
)
language sql stable security definer set search_path = '' as $$
  select r.reservation_date, r.reservation_time, r.party_size, r.status
  from public.reservations r
  join public.businesses b on b.id = r.business_id
  where lower(b.business_slug) = lower(nullif(btrim(p_business_slug), ''))
    and r.reservation_reference = nullif(btrim(p_reservation_reference), '')
    and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 6
    and regexp_replace(r.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

create or replace function public.get_public_restaurant_reschedule_slots(
  p_business_slug text, p_reservation_reference text, p_phone text, p_local_date date
) returns table(reservation_time time)
language sql stable security definer set search_path = '' as $$
  with verified as (
    select r.id, r.business_id, r.party_size
    from public.reservations r join public.businesses b on b.id=r.business_id
    where lower(b.business_slug)=lower(nullif(btrim(p_business_slug),''))
      and r.reservation_reference=nullif(btrim(p_reservation_reference),'')
      and length(regexp_replace(p_phone,'[^0-9]','','g')) >= 6
      and regexp_replace(r.phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
      and r.status='confirmed'
  ), candidates as (
    select v.*, s.max_guests_per_slot,
      gs::time as slot_time
    from verified v join public.restaurant_settings s on s.business_id=v.business_id
    cross join lateral generate_series(
      p_local_date + s.opening_time,
      p_local_date + s.closing_time - interval '30 minutes',
      interval '30 minutes'
    ) gs
    where p_local_date between current_date and current_date + 730
  )
  select c.slot_time
  from candidates c
  where p_local_date + c.slot_time > localtimestamp
    and coalesce((select sum(r.party_size) from public.reservations r
      where r.business_id=c.business_id and r.id<>c.id and r.status='confirmed'
        and r.reservation_date=p_local_date and r.reservation_time=c.slot_time),0)
      + c.party_size <= c.max_guests_per_slot
  order by c.slot_time;
$$;

create or replace function public.reschedule_public_restaurant_reservation(
  p_business_slug text, p_reservation_reference text, p_phone text,
  p_new_date date, p_new_time time
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations%rowtype;
  v_open time; v_close time; v_capacity integer; v_reserved integer;
begin
  if p_new_date < current_date or p_new_date > current_date + 730
    or length(regexp_replace(p_phone,'[^0-9]','','g')) < 6 then return false; end if;
  select r.* into v_row from public.reservations r
  join public.businesses b on b.id=r.business_id
  where lower(b.business_slug)=lower(nullif(btrim(p_business_slug),''))
    and r.reservation_reference=nullif(btrim(p_reservation_reference),'')
    and regexp_replace(r.phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
    and r.status='confirmed' for update of r;
  if v_row.id is null then return false; end if;
  select opening_time,closing_time,max_guests_per_slot into v_open,v_close,v_capacity
    from public.restaurant_settings where business_id=v_row.business_id;
  if p_new_time<v_open or p_new_time>=v_close or p_new_date+p_new_time<=localtimestamp then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(v_row.business_id::text||':'||p_new_date::text||':'||p_new_time::text,0));
  select coalesce(sum(party_size),0)::integer into v_reserved from public.reservations
    where business_id=v_row.business_id and id<>v_row.id and status='confirmed'
      and reservation_date=p_new_date and reservation_time=p_new_time;
  if v_reserved+v_row.party_size>v_capacity then raise exception 'This time slot no longer has enough capacity' using errcode='23P01'; end if;
  update public.reservations set reservation_date=p_new_date,reservation_time=p_new_time where id=v_row.id;
  return true;
end; $$;

create or replace function public.get_public_booking_for_management(
  p_business_slug text, p_reference text, p_phone text
) returns table(
  booking_kind text, service_slug text, service_name text, staff_slug text,
  staff_name text, staff_timezone text, starts_at timestamptz, ends_at timestamptz,
  quantity integer, status text
)
language sql stable security definer set search_path = '' as $$
  select case when bk.scheduled_session_id is null then 'appointment' else 'session' end,
    s.slug,s.name,sm.slug,sm.display_name,coalesce(sm.timezone,'UTC'),
    bk.starts_at,bk.ends_at,bk.quantity,bk.status
  from public.bookings bk join public.businesses b on b.id=bk.business_id
  join public.services s on s.id=bk.service_id
  left join public.staff_members sm on sm.id=coalesce(bk.staff_id,
    (select ss.staff_id from public.scheduled_sessions ss where ss.id=bk.scheduled_session_id))
  where lower(b.business_slug)=lower(nullif(btrim(p_business_slug),''))
    and bk.reference=nullif(btrim(p_reference),'')
    and length(regexp_replace(p_phone,'[^0-9]','','g'))>=6
    and regexp_replace(bk.customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
  limit 1;
$$;

create or replace function public.get_public_booking_reschedule_options(
  p_business_slug text, p_reference text, p_phone text,
  p_from_date date, p_to_date date
) returns table(
  session_id bigint, starts_at timestamptz, ends_at timestamptz,
  staff_slug text, staff_name text, staff_timezone text, remaining_capacity integer
)
language plpgsql stable security definer set search_path = '' as $$
declare v public.bookings%rowtype; v_service_slug text; v_staff_slug text;
begin
  if p_from_date<current_date or p_to_date<p_from_date or p_to_date>p_from_date+31
    or length(regexp_replace(p_phone,'[^0-9]','','g'))<6 then return; end if;
  select bk.* into v
  from public.bookings bk join public.businesses b on b.id=bk.business_id
  join public.services s on s.id=bk.service_id left join public.staff_members sm on sm.id=bk.staff_id
  where lower(b.business_slug)=lower(nullif(btrim(p_business_slug),''))
    and bk.reference=nullif(btrim(p_reference),'')
    and regexp_replace(bk.customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
    and bk.status in ('pending','confirmed');
  if v.id is null then return; end if;
  select s.slug,sm.slug into v_service_slug,v_staff_slug
    from public.services s left join public.staff_members sm on sm.id=v.staff_id
    where s.id=v.service_id;
  if v.scheduled_session_id is null then
    return query select null::bigint,x.starts_at,x.ends_at,sm.slug,sm.display_name,sm.timezone,null::integer
      from generate_series(p_from_date,p_to_date,interval '1 day') d
      cross join lateral public.get_available_slots(p_business_slug,v_service_slug,v_staff_slug,d::date) x
      join public.staff_members sm on sm.id=v.staff_id order by x.starts_at;
  else
    return query select ss.id,ss.starts_at,ss.ends_at,sm.slug,sm.display_name,sm.timezone,
      greatest(ss.capacity-coalesce(sum(bk.quantity) filter(where bk.status in ('pending','confirmed') and bk.id<>v.id),0)::integer,0)
      from public.scheduled_sessions ss join public.staff_members sm on sm.id=ss.staff_id
      left join public.bookings bk on bk.scheduled_session_id=ss.id
      where ss.business_id=v.business_id and ss.service_id=v.service_id and ss.status='scheduled' and ss.is_published
        and ss.starts_at>now() and (ss.starts_at at time zone sm.timezone)::date between p_from_date and p_to_date
      group by ss.id,sm.id
      having ss.capacity-coalesce(sum(bk.quantity) filter(where bk.status in ('pending','confirmed') and bk.id<>v.id),0)>=v.quantity
      order by ss.starts_at;
  end if;
end; $$;

create or replace function public.cancel_public_booking(
  p_business_slug text, p_reference text, p_phone text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if length(regexp_replace(p_phone,'[^0-9]','','g'))<6 then return false; end if;
  update public.bookings bk set status='cancelled'
  from public.businesses b where b.id=bk.business_id
    and lower(b.business_slug)=lower(nullif(btrim(p_business_slug),''))
    and bk.reference=nullif(btrim(p_reference),'')
    and regexp_replace(bk.customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
    and bk.status in ('pending','confirmed') and bk.starts_at>now();
  get diagnostics v_count=row_count; return v_count=1;
end; $$;

create or replace function public.reschedule_public_booking(
  p_business_slug text, p_reference text, p_phone text,
  p_new_starts_at timestamptz default null, p_new_session_id bigint default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype; v_session public.scheduled_sessions%rowtype;
  v_service_slug text; v_staff_slug text; v_duration integer; v_end timestamptz; v_reserved integer;
begin
  if length(regexp_replace(p_phone,'[^0-9]','','g'))<6 then return false; end if;
  select bk.* into v from public.bookings bk join public.businesses b on b.id=bk.business_id
  where lower(b.business_slug)=lower(nullif(btrim(p_business_slug),'')) and bk.reference=nullif(btrim(p_reference),'')
    and regexp_replace(bk.customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')
    and bk.status in ('pending','confirmed') and bk.starts_at>now() for update of bk;
  if v.id is null then return false; end if;
  if v.scheduled_session_id is not null then
    if p_new_session_id is null then return false; end if;
    select * into v_session from public.scheduled_sessions where id=p_new_session_id
      and business_id=v.business_id and service_id=v.service_id and status='scheduled' and is_published and starts_at>now() for update;
    if v_session.id is null then return false; end if;
    select coalesce(sum(quantity),0)::integer into v_reserved from public.bookings
      where scheduled_session_id=v_session.id and id<>v.id and status in ('pending','confirmed');
    if v_reserved+v.quantity>v_session.capacity then raise exception 'This session no longer has enough places' using errcode='23P01'; end if;
    update public.bookings set scheduled_session_id=v_session.id,staff_id=null,starts_at=v_session.starts_at,
      ends_at=v_session.ends_at,occupied_starts_at=v_session.starts_at,occupied_ends_at=v_session.ends_at where id=v.id;
  else
    if p_new_starts_at is null or p_new_starts_at<=now() then return false; end if;
    select s.slug,sm.slug,coalesce(ss.custom_duration_minutes,s.duration_minutes)
      into v_service_slug,v_staff_slug,v_duration from public.services s
      join public.staff_members sm on sm.id=v.staff_id
      join public.staff_services ss on ss.staff_id=sm.id and ss.service_id=s.id and ss.is_active
      where s.id=v.service_id;
    perform pg_catalog.pg_advisory_xact_lock(v.staff_id);
    if p_new_starts_at<>v.starts_at and not exists(select 1 from public.get_available_slots(
      p_business_slug,v_service_slug,v_staff_slug,(p_new_starts_at at time zone (select timezone from public.staff_members where id=v.staff_id))::date
    ) x where x.starts_at=p_new_starts_at) then raise exception 'This time is no longer available' using errcode='23P01'; end if;
    v_end:=p_new_starts_at+make_interval(mins=>v_duration);
    update public.bookings set starts_at=p_new_starts_at,ends_at=v_end,
      occupied_starts_at=p_new_starts_at-make_interval(mins=>v.buffer_before_minutes),
      occupied_ends_at=v_end+make_interval(mins=>v.buffer_after_minutes) where id=v.id;
  end if;
  return true;
exception when exclusion_violation then raise exception 'This time is no longer available' using errcode='23P01';
end; $$;

-- New self-service bookings must include a phone number because it is the
-- second factor used to manage the booking later.
create or replace function public.create_public_booking(
  p_business_slug text, p_service_slug text, p_staff_slug text, p_starts_at timestamptz,
  p_customer_name text, p_customer_email text default null, p_customer_phone text default null,
  p_notes text default null
) returns table(booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_business_id bigint; v_service_id bigint; v_staff_id bigint; v_duration integer;
  v_before integer; v_after integer; v_end timestamptz; v_reference text; v_id uuid; v_timezone text;
begin
  if nullif(btrim(p_customer_name),'') is null or length(regexp_replace(p_customer_phone,'[^0-9]','','g'))<6
    then raise exception 'Customer name and phone are required' using errcode='22023'; end if;
  select b.id,s.id,sm.id,coalesce(ss.custom_duration_minutes,s.duration_minutes),s.buffer_before_minutes,s.buffer_after_minutes,sm.timezone
    into v_business_id,v_service_id,v_staff_id,v_duration,v_before,v_after,v_timezone
  from public.businesses b join public.services s on s.business_id=b.id
  join public.staff_services ss on ss.service_id=s.id and ss.is_active
  join public.staff_members sm on sm.id=ss.staff_id and sm.business_id=b.id
  where lower(b.business_slug)=lower(p_business_slug) and lower(s.slug)=lower(p_service_slug)
    and lower(sm.slug)=lower(p_staff_slug) and s.is_active and s.is_published and sm.is_active and sm.is_published;
  if v_staff_id is null then raise exception 'Service or staff member not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(v_staff_id);
  if not exists(select 1 from public.get_available_slots(p_business_slug,p_service_slug,p_staff_slug,
    (p_starts_at at time zone v_timezone)::date) x where x.starts_at=p_starts_at)
    then raise exception 'This time is no longer available' using errcode='23P01'; end if;
  v_end:=p_starts_at+make_interval(mins=>v_duration); v_reference:='BK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.bookings(business_id,service_id,staff_id,customer_name,customer_email,customer_phone,starts_at,ends_at,
    buffer_before_minutes,buffer_after_minutes,occupied_starts_at,occupied_ends_at,reference,notes)
  values(v_business_id,v_service_id,v_staff_id,left(btrim(p_customer_name),200),nullif(left(btrim(p_customer_email),320),''),
    left(btrim(p_customer_phone),50),p_starts_at,v_end,v_before,v_after,p_starts_at-make_interval(mins=>v_before),
    v_end+make_interval(mins=>v_after),v_reference,nullif(left(btrim(p_notes),2000),'')) returning id into v_id;
  return query select v_id,v_reference,p_starts_at,v_end;
exception when exclusion_violation then raise exception 'This time is no longer available' using errcode='23P01'; end; $$;

-- Require phone for class/session bookings as well.
create or replace function public.create_public_session_booking(
  p_business_slug text,p_service_slug text,p_session_id bigint,p_customer_name text,
  p_customer_email text default null,p_customer_phone text default null,p_notes text default null,p_quantity integer default 1
) returns table(booking_id uuid,reference text,starts_at timestamptz,ends_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_session public.scheduled_sessions%rowtype; v_reserved integer; v_reference text; v_id uuid;
begin
  if nullif(btrim(p_customer_name),'') is null or p_quantity<1 or length(regexp_replace(p_customer_phone,'[^0-9]','','g'))<6
    then raise exception 'Customer name, phone and valid quantity are required' using errcode='22023'; end if;
  select ss.* into v_session from public.scheduled_sessions ss join public.businesses b on b.id=ss.business_id
  join public.services s on s.id=ss.service_id where ss.id=p_session_id and lower(b.business_slug)=lower(p_business_slug)
    and lower(s.slug)=lower(p_service_slug) and s.scheduling_mode='scheduled' and s.is_active and s.is_published
    and ss.status='scheduled' and ss.is_published and ss.starts_at>now() for update of ss;
  if v_session.id is null then raise exception 'This session is no longer available' using errcode='P0002'; end if;
  select coalesce(sum(quantity),0)::integer into v_reserved from public.bookings where scheduled_session_id=v_session.id and status in ('pending','confirmed');
  if v_reserved+p_quantity>v_session.capacity then raise exception 'This session no longer has enough places' using errcode='23P01'; end if;
  v_reference:='BK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.bookings(business_id,service_id,staff_id,scheduled_session_id,customer_name,customer_email,customer_phone,
    starts_at,ends_at,quantity,buffer_before_minutes,buffer_after_minutes,occupied_starts_at,occupied_ends_at,reference,notes)
  values(v_session.business_id,v_session.service_id,null,v_session.id,left(btrim(p_customer_name),200),
    nullif(left(btrim(p_customer_email),320),''),left(btrim(p_customer_phone),50),v_session.starts_at,v_session.ends_at,p_quantity,
    0,0,v_session.starts_at,v_session.ends_at,v_reference,nullif(left(btrim(p_notes),2000),'')) returning id into v_id;
  return query select v_id,v_reference,v_session.starts_at,v_session.ends_at;
end; $$;

revoke all on function public.get_public_restaurant_reservation(text,text,text) from public;
revoke all on function public.get_public_restaurant_reschedule_slots(text,text,text,date) from public;
revoke all on function public.reschedule_public_restaurant_reservation(text,text,text,date,time) from public;
revoke all on function public.get_public_booking_for_management(text,text,text) from public;
revoke all on function public.get_public_booking_reschedule_options(text,text,text,date,date) from public;
revoke all on function public.cancel_public_booking(text,text,text) from public;
revoke all on function public.reschedule_public_booking(text,text,text,timestamptz,bigint) from public;
grant execute on function public.get_public_restaurant_reservation(text,text,text) to anon,authenticated;
grant execute on function public.get_public_restaurant_reschedule_slots(text,text,text,date) to anon,authenticated;
grant execute on function public.reschedule_public_restaurant_reservation(text,text,text,date,time) to anon,authenticated;
grant execute on function public.get_public_booking_for_management(text,text,text) to anon,authenticated;
grant execute on function public.get_public_booking_reschedule_options(text,text,text,date,date) to anon,authenticated;
grant execute on function public.cancel_public_booking(text,text,text) to anon,authenticated;
grant execute on function public.reschedule_public_booking(text,text,text,timestamptz,bigint) to anon,authenticated;
