-- R2B 4C.3B.0: add an idempotent scheduled-session booking contract.
-- The existing public-form RPC remains unchanged for browser callers.

create or replace function public.create_public_session_booking_idempotent(
  p_business_slug text,
  p_service_slug text,
  p_session_id bigint,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_quantity integer,
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
  v_session public.scheduled_sessions%rowtype;
  v_existing public.bookings%rowtype;
  v_created record;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_fingerprint text := nullif(btrim(p_request_fingerprint), '');
begin
  if v_key is null or v_fingerprint is null then
    raise exception 'An idempotency key and request fingerprint are required' using errcode = '22023';
  end if;
  if nullif(btrim(p_customer_name), '') is null or p_quantity is null or p_quantity < 1 then
    raise exception 'Customer name and a valid quantity are required' using errcode = '22023';
  end if;

  select b.id into v_business_id
  from public.businesses b
  where lower(b.business_slug) = lower(p_business_slug);
  if v_business_id is null then
    raise exception 'Service or session not found' using errcode = 'P0002';
  end if;

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

  -- Lock the authoritative occurrence before capacity evaluation. The replay
  -- check above makes an exact retry safe even if the occurrence has since
  -- become unavailable; this second check closes the concurrent first-write
  -- race after the session lock is acquired.
  select ss.* into v_session
  from public.scheduled_sessions ss
  join public.services s on s.id = ss.service_id and s.business_id = ss.business_id
  where ss.id = p_session_id
    and ss.business_id = v_business_id
    and lower(s.slug) = lower(p_service_slug)
    and s.scheduling_mode = 'scheduled'
    and s.is_active and s.is_published
    and ss.status = 'scheduled' and ss.is_published
    and ss.starts_at > now()
  for update of ss;

  if v_session.id is null then
    raise exception 'This session is no longer available' using errcode = 'P0002';
  end if;

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

  select * into v_created
  from public.create_public_session_booking(
    p_business_slug, p_service_slug, p_session_id, p_customer_name,
    p_customer_email, p_customer_phone, p_notes, p_quantity, p_custom_data
  );

  update public.bookings
  set idempotency_key = v_key,
      idempotency_request_fingerprint = v_fingerprint
  where id = v_created.booking_id;

  return query select v_created.booking_id, v_created.reference, v_created.starts_at, v_created.ends_at;
exception
  when unique_violation then
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
    raise;
end;
$$;

revoke all on function public.create_public_session_booking_idempotent(
  text, text, bigint, text, text, text, text, integer, jsonb, text, text
) from public;
grant execute on function public.create_public_session_booking_idempotent(
  text, text, bigint, text, text, text, text, integer, jsonb, text, text
) to anon, authenticated;

-- Preserve the existing lookup columns and append scheduled-session identity
-- needed by reconciliation. Existing named-field consumers remain compatible.
drop function if exists public.get_public_booking_by_idempotency_key(text, text);

create function public.get_public_booking_by_idempotency_key(
  p_business_slug text,
  p_idempotency_key text
)
returns table (
  booking_id uuid,
  reference text,
  starts_at timestamptz,
  ends_at timestamptz,
  booking_status text,
  business_id bigint,
  request_fingerprint text,
  service_id bigint,
  scheduled_session_id bigint,
  idempotency_key text
)
language sql
security definer
set search_path = ''
as $$
  select bk.id, bk.reference, bk.starts_at, bk.ends_at, bk.status,
         bk.business_id, bk.idempotency_request_fingerprint,
         bk.service_id, bk.scheduled_session_id, bk.idempotency_key
  from public.bookings bk
  join public.businesses b on b.id = bk.business_id
  where lower(b.business_slug) = lower(p_business_slug)
    and bk.idempotency_key = nullif(btrim(p_idempotency_key), '')
  limit 1;
$$;

revoke all on function public.get_public_booking_by_idempotency_key(text, text) from public;
grant execute on function public.get_public_booking_by_idempotency_key(text, text) to anon, authenticated;
