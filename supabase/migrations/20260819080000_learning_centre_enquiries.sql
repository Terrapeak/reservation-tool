alter table public.class_enrollments add column if not exists guardian_name text;
alter table public.class_enrollments add column if not exists student_date_of_birth date;
alter table public.class_enrollments add column if not exists school_grade text;
alter table public.class_enrollments add column if not exists enquiry_status text not null default 'new';
alter table public.class_enrollments add column if not exists contact_requested boolean not null default false;
alter table public.class_enrollments add column if not exists consent_to_contact boolean not null default false;
alter table public.class_enrollments drop constraint if exists class_enrollments_enquiry_status_check;
alter table public.class_enrollments add constraint class_enrollments_enquiry_status_check
  check(enquiry_status in ('new','contacted','accepted','declined','withdrawn'));

create function public.create_public_class_enquiry(
  p_business_slug text,p_service_slug text,p_guardian_name text,p_student_name text,
  p_customer_email text,p_customer_phone text,p_student_date_of_birth date,p_school_grade text,
  p_joins_on date,p_notes text,p_consent_to_contact boolean
) returns table(reference text,remaining integer) language plpgsql security definer set search_path='' as $$
declare v_service public.services%rowtype; v_enrolled integer; v_reference text;
begin
  select s.* into v_service from public.services s join public.businesses b on b.id=s.business_id
  where lower(b.business_slug)=lower(p_business_slug) and lower(s.slug)=lower(p_service_slug)
    and s.is_active and s.is_published and s.enrollment_mode='cohort' and not s.enrollment_closed for update of s;
  if v_service.id is null then raise exception 'This class is not open for enquiries' using errcode='22023'; end if;
  if nullif(btrim(p_guardian_name),'') is null or nullif(btrim(p_student_name),'') is null or nullif(btrim(p_customer_phone),'') is null or not coalesce(p_consent_to_contact,false) then
    raise exception 'Guardian name, student name, phone and permission to contact are required' using errcode='22023'; end if;
  select coalesce(sum(quantity),0)::integer into v_enrolled from public.class_enrollments where service_id=v_service.id and status in ('pending','confirmed');
  if v_enrolled+1>v_service.capacity then raise exception 'This class no longer has enough enquiry places' using errcode='23P01'; end if;
  v_reference:='EN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.class_enrollments(business_id,service_id,reference,customer_name,guardian_name,customer_email,customer_phone,quantity,joins_on,status,notes,student_date_of_birth,school_grade,enquiry_status,consent_to_contact)
  values(v_service.business_id,v_service.id,v_reference,left(btrim(p_student_name),200),left(btrim(p_guardian_name),200),nullif(left(btrim(p_customer_email),320),''),left(btrim(p_customer_phone),50),1,greatest(coalesce(p_joins_on,current_date),v_service.cohort_start_date),'pending',nullif(left(btrim(p_notes),2000),''),p_student_date_of_birth,nullif(left(btrim(p_school_grade),100),''),'new',true);
  return query select v_reference,v_service.capacity-v_enrolled-1;
end $$;

create function public.get_public_class_enquiry(p_business_slug text,p_reference text,p_phone text)
returns table(reference text,class_name text,student_name text,joins_on date,enquiry_status text,contact_requested boolean)
language sql stable security definer set search_path='' as $$
 select e.reference,s.name,e.customer_name,e.joins_on,e.enquiry_status,e.contact_requested
 from public.class_enrollments e join public.services s on s.id=e.service_id join public.businesses b on b.id=e.business_id
 where lower(b.business_slug)=lower(p_business_slug) and upper(e.reference)=upper(btrim(p_reference)) and e.customer_phone=btrim(p_phone) limit 1;
$$;

create function public.manage_public_class_enquiry(p_business_slug text,p_reference text,p_phone text,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_action not in ('withdraw','request_contact') then raise exception 'Unsupported enquiry action' using errcode='22023'; end if;
 update public.class_enrollments e set
   status=case when p_action='withdraw' then 'cancelled' else status end,
   enquiry_status=case when p_action='withdraw' then 'withdrawn' else enquiry_status end,
   contact_requested=case when p_action='request_contact' then true else contact_requested end,updated_at=now()
 from public.businesses b where b.id=e.business_id and lower(b.business_slug)=lower(p_business_slug)
   and upper(e.reference)=upper(btrim(p_reference)) and e.customer_phone=btrim(p_phone);
 if not found then raise exception 'Enquiry not found' using errcode='P0002'; end if;
end $$;

create function public.set_class_enquiry_status(p_enquiry_id uuid,p_enquiry_status text) returns void
language plpgsql security definer set search_path='' as $$
declare v_business_id bigint;
begin
 if p_enquiry_status not in ('new','contacted','accepted','declined') then raise exception 'Unsupported enquiry status' using errcode='22023'; end if;
 select business_id into v_business_id from public.class_enrollments where id=p_enquiry_id;
 if v_business_id is null or not (select private.has_business_role(v_business_id,array['owner','manager'])) then raise exception 'Enquiry not found or access denied' using errcode='42501'; end if;
 update public.class_enrollments set enquiry_status=p_enquiry_status,status=case when p_enquiry_status='accepted' then 'confirmed' when p_enquiry_status='declined' then 'cancelled' else 'pending' end,contact_requested=false,updated_at=now() where id=p_enquiry_id;
end $$;

revoke all on function public.create_public_class_enquiry(text,text,text,text,text,text,date,text,date,text,boolean) from public,anon,authenticated;
revoke all on function public.get_public_class_enquiry(text,text,text) from public,anon,authenticated;
revoke all on function public.manage_public_class_enquiry(text,text,text,text) from public,anon,authenticated;
revoke all on function public.set_class_enquiry_status(uuid,text) from public,anon,authenticated;
grant execute on function public.create_public_class_enquiry(text,text,text,text,text,text,date,text,date,text,boolean) to anon,authenticated;
grant execute on function public.get_public_class_enquiry(text,text,text) to anon,authenticated;
grant execute on function public.manage_public_class_enquiry(text,text,text,text) to anon,authenticated;
grant execute on function public.set_class_enquiry_status(uuid,text) to authenticated;
