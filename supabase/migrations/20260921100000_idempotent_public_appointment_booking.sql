-- R2B only: add a tenant-scoped idempotency contract for automated
-- appointment bookings. Existing public booking functions remain unchanged.

alter table public.bookings
  add column if not exists idempotency_key text;

alter table public.bookings
  add column if not exists idempotency_request_fingerprint text;

create unique index if not exists bookings_business_idempotency_key_unique
  on public.bookings (business_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_public_booking_idempotent(
  p_business_slug text,
  p_service_slug text,
  p_staff_slug text,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_custom_data jsonb,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
  v_service_id bigint;
  v_staff_id bigint;
  v_duration integer;
  v_before integer;
  v_after integer;
  v_end timestamptz;
  v_reference text;
  v_id uuid;
  v_timezone text;
  v_existing public.bookings%rowtype;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_fingerprint text := nullif(btrim(p_request_fingerprint), '');
begin
  if v_key is not null and v_fingerprint is null then
    raise exception 'A request fingerprint is required for idempotent bookings' using errcode = '22023';
  end if;
  if nullif(btrim(p_customer_name), '') is null
    or length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')) < 6 then
    raise exception 'Customer name and phone are required' using errcode = '22023';
  end if;

  select b.id, s.id, sm.id, coalesce(ss.custom_duration_minutes, s.duration_minutes),
    s.buffer_before_minutes, s.buffer_after_minutes, sm.timezone
  into v_business_id, v_service_id, v_staff_id, v_duration, v_before, v_after, v_timezone
  from public.businesses b
  join public.services s on s.business_id = b.id
  join public.staff_services ss on ss.service_id = s.id and ss.is_active
  join public.staff_members sm on sm.id = ss.staff_id and sm.business_id = b.id
  where lower(b.business_slug) = lower(p_business_slug)
    and lower(s.slug) = lower(p_service_slug)
    and lower(sm.slug) = lower(p_staff_slug)
    and s.is_active and s.is_published and sm.is_active and sm.is_published;

  if v_staff_id is null then
    raise exception 'Service or staff member not found' using errcode = 'P0002';
  end if;

  if v_key is not null then
    select * into v_existing
    from public.bookings
    where business_id = v_business_id and idempotency_key = v_key
    limit 1;
    if found then
      if v_existing.idempotency_request_fingerprint is distinct from v_fingerprint then
        raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = 'P0001';
      end if;
      return query select v_existing.id, v_existing.reference, v_existing.starts_at, v_existing.ends_at;
      return;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_staff_id);

  -- The provider lock serializes same-staff requests. Re-check the key after
  -- waiting so an identical concurrent request replays the committed booking
  -- instead of re-running availability validation.
  if v_key is not null then
    select * into v_existing
    from public.bookings
    where business_id = v_business_id and idempotency_key = v_key
    limit 1;
    if found then
      if v_existing.idempotency_request_fingerprint is distinct from v_fingerprint then
        raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = 'P0001';
      end if;
      return query select v_existing.id, v_existing.reference, v_existing.starts_at, v_existing.ends_at;
      return;
    end if;
  end if;

  if not exists (
    select 1 from public.get_available_slots(
      p_business_slug, p_service_slug, p_staff_slug,
      (p_starts_at at time zone v_timezone)::date
    ) slot where slot.starts_at = p_starts_at
  ) then
    raise exception 'This time is no longer available' using errcode = '23P01';
  end if;

  v_end := p_starts_at + make_interval(mins => v_duration);
  v_reference := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.bookings (
    business_id, service_id, staff_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
    occupied_starts_at, occupied_ends_at, reference, notes, custom_data, idempotency_key,
    idempotency_request_fingerprint
  ) values (
    v_business_id, v_service_id, v_staff_id, left(btrim(p_customer_name), 200),
    nullif(left(btrim(p_customer_email), 320), ''), left(btrim(p_customer_phone), 50),
    p_starts_at, v_end, v_before, v_after,
    p_starts_at - make_interval(mins => v_before), v_end + make_interval(mins => v_after),
    v_reference, nullif(left(btrim(p_notes), 2000), ''),
    private.normalize_public_customer_form_data(v_business_id, coalesce(p_custom_data, '{}'::jsonb)),
    v_key, v_fingerprint
  ) returning id into v_id;

  return query select v_id, v_reference, p_starts_at, v_end;
exception
  when unique_violation then
    if v_key is not null then
      select * into v_existing
      from public.bookings
      where business_id = v_business_id and idempotency_key = v_key
      limit 1;
      if found then
        if v_existing.idempotency_request_fingerprint is distinct from v_fingerprint then
          raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = 'P0001';
        end if;
        return query select v_existing.id, v_existing.reference, v_existing.starts_at, v_existing.ends_at;
        return;
      end if;
    end if;
    raise;
  when exclusion_violation then
    raise exception 'This time is no longer available' using errcode = '23P01';
end;
$$;

revoke all on function public.create_public_booking_idempotent(
  text, text, text, timestamptz, text, text, text, text, jsonb, text, text
) from public;
grant execute on function public.create_public_booking_idempotent(
  text, text, text, timestamptz, text, text, text, text, jsonb, text, text
) to anon, authenticated;

create or replace function public.get_public_booking_by_idempotency_key(
  p_business_slug text,
  p_idempotency_key text
)
returns table (booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz, booking_status text, business_id bigint, request_fingerprint text)
language sql
security definer
set search_path = ''
as $$
  select bk.id, bk.reference, bk.starts_at, bk.ends_at, bk.status, bk.business_id, bk.idempotency_request_fingerprint
  from public.bookings bk
  join public.businesses b on b.id = bk.business_id
  where lower(b.business_slug) = lower(p_business_slug)
    and bk.idempotency_key = nullif(btrim(p_idempotency_key), '')
  limit 1;
$$;

revoke all on function public.get_public_booking_by_idempotency_key(text, text) from public;
grant execute on function public.get_public_booking_by_idempotency_key(text, text) to anon, authenticated;
