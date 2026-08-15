-- Authenticated tenant creation for the guided owner onboarding flow.

create unique index if not exists business_profile_business_id_key
  on public.business_profile (business_id) where business_id is not null;

create or replace function public.create_owner_business(
  p_business_name text,
  p_business_slug text,
  p_business_type text,
  p_industry_template text default 'general'
)
returns table (business_id bigint, business_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id bigint;
  v_slug text := lower(btrim(p_business_slug));
  v_name text := btrim(p_business_name);
begin
  if v_user_id is null then
    raise exception 'You must sign in before creating a business' using errcode = '28000';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Business name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) < 3 or length(v_slug) > 80 then
    raise exception 'Business URL must be 3–80 lowercase letters, numbers or hyphens' using errcode = '22023';
  end if;
  if p_business_type not in ('restaurant','physiotherapy','wellness','learning_centre','classes','general') then
    raise exception 'Unsupported business type' using errcode = '22023';
  end if;

  insert into public.businesses (business_name, business_slug, business_type)
  values (v_name, v_slug, p_business_type)
  returning id into v_business_id;

  insert into public.business_memberships (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  insert into public.business_profile (
    business_id, business_name, business_type, industry_template,
    booking_label, customer_label, capacity_label, uses_capacity, reference_prefix
  ) values (
    v_business_id, v_name, p_business_type, p_industry_template,
    case when p_business_type='learning_centre' then 'Lesson' else 'Booking' end,
    'Customer', case when p_business_type='restaurant' then 'Guests' else 'Places' end,
    p_business_type in ('restaurant','classes'), upper(substr(regexp_replace(v_slug,'[^a-z0-9]','','g'),1,4))
  );

  return query select v_business_id, v_slug;
exception
  when unique_violation then
    raise exception 'That business URL is already in use' using errcode = '23505';
end;
$$;

revoke all on function public.create_owner_business(text,text,text,text) from public, anon;
grant execute on function public.create_owner_business(text,text,text,text) to authenticated;

comment on function public.create_owner_business(text,text,text,text) is
  'Creates a tenant and its first owner membership for the currently authenticated user.';
