-- R2B 4C.3B.0.1: extend idempotency reconciliation with authoritative booking identity.
-- This is a function-only forward migration; it does not touch booking rows.

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
  select bk.id,
         bk.reference,
         bk.starts_at,
         bk.ends_at,
         bk.status,
         bk.business_id,
         bk.idempotency_request_fingerprint,
         bk.service_id,
         bk.scheduled_session_id,
         bk.idempotency_key
  from public.bookings bk
  join public.businesses b on b.id = bk.business_id
  where lower(b.business_slug) = lower(p_business_slug)
    and bk.idempotency_key = nullif(btrim(p_idempotency_key), '')
  limit 1;
$$;

revoke all on function public.get_public_booking_by_idempotency_key(text, text) from public;
grant execute on function public.get_public_booking_by_idempotency_key(text, text) to anon, authenticated;
