import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL(
  "../supabase/migrations/20260925110000_idempotent_public_session_booking.sql",
  import.meta.url,
), "utf8");
const publicForm = await readFile(new URL(
  "../supabase/migrations/20260908103000_customer_form_booking_contract.sql",
  import.meta.url,
), "utf8");
const appointment = await readFile(new URL(
  "../supabase/migrations/20260921100000_idempotent_public_appointment_booking.sql",
  import.meta.url,
), "utf8");

test("preserves the existing public scheduled-session RPC", () => {
  assert.match(publicForm, /create or replace function public\.create_public_session_booking\(/i);
  assert.match(publicForm, /p_custom_data jsonb\s*\)/i);
  assert.match(publicForm, /grant execute on function public\.create_public_session_booking\(/i);
  assert.match(migration, /create or replace function public\.create_public_session_booking_idempotent\(/i);
});

test("matches the established eleven-parameter idempotent booking contract", () => {
  const signature = "text, text, bigint, text, text, text, text, integer, jsonb, text, text";
  assert.match(migration, new RegExp(`create or replace function public\\.create_public_session_booking_idempotent\\([\\s\\S]*?${signature.replaceAll(" ", "\\s*")}`, "i"));
  for (const parameter of ["p_business_slug", "p_service_slug", "p_session_id", "p_customer_name", "p_customer_email", "p_customer_phone", "p_notes", "p_quantity", "p_custom_data", "p_idempotency_key", "p_request_fingerprint"]) {
    assert.match(migration, new RegExp(`\\b${parameter}\\b`));
  }
  assert.match(migration, /returns table\s*\(booking_id uuid, reference text, starts_at timestamptz, ends_at timestamptz\)/i);
});

test("preserves the security and grant posture of the existing idempotent contract", () => {
  assert.match(migration, /language plpgsql\s+security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.create_public_session_booking_idempotent\([\s\S]*?\) from public/i);
  assert.match(migration, /grant execute on function public\.create_public_session_booking_idempotent\([\s\S]*?\) to anon, authenticated/i);
  assert.match(appointment, /create or replace function public\.create_public_booking_idempotent\(/i);
});

test("writes the canonical scheduled-session booking identity and idempotency fields", () => {
  assert.match(migration, /create_public_session_booking\([\s\S]*p_custom_data\s*\)/i);
  assert.match(migration, /update public\.bookings[\s\S]*set idempotency_key = v_key[\s\S]*idempotency_request_fingerprint = v_fingerprint/i);
  assert.match(migration, /scheduled_session_id/i);
  assert.match(migration, /p_quantity/);
  assert.match(migration, /p_custom_data/);
  assert.match(migration, /gen_random_uuid|reference/i);
});

test("replays exact requests and rejects fingerprint conflicts", () => {
  assert.match(migration, /where business_id = v_business_id and idempotency_key = v_key/i);
  assert.match(migration, /if v_existing\.idempotency_request_fingerprint is distinct from v_fingerprint/i);
  assert.match(migration, /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/);
  assert.match(migration, /return query select v_existing\.id, v_existing\.reference, v_existing\.starts_at, v_existing\.ends_at/i);
  assert.match(migration, /when unique_violation then/i);
});

test("checks exact replay before requiring the session to remain bookable", () => {
  const replayIndex = migration.indexOf("where business_id = v_business_id and idempotency_key = v_key");
  const sessionLockIndex = migration.indexOf("for update of ss");
  assert.ok(replayIndex >= 0);
  assert.ok(sessionLockIndex > replayIndex);
  assert.match(migration, /v_existing\.idempotency_request_fingerprint is distinct from v_fingerprint/i);
});

test("rechecks the key after the session lock and recovers unique-key races", () => {
  const lockIndex = migration.indexOf("for update of ss");
  const secondReplayIndex = migration.indexOf("where business_id = v_business_id and idempotency_key = v_key", lockIndex);
  assert.ok(secondReplayIndex > lockIndex);
  assert.match(migration, /exception\s+when unique_violation then[\s\S]*?select \* into v_existing/i);
  assert.match(migration, /p_customer_name.*p_quantity is null|p_quantity is null.*p_customer_name/i);
});

test("preserves authoritative session and capacity checks", () => {
  assert.match(migration, /join public\.services s on s\.id = ss\.service_id and s\.business_id = ss\.business_id/i);
  assert.match(migration, /s\.scheduling_mode = 'scheduled'/i);
  assert.match(migration, /s\.is_active and s\.is_published/i);
  assert.match(migration, /ss\.status = 'scheduled' and ss\.is_published/i);
  assert.match(migration, /ss\.starts_at > now\(\)/i);
  assert.match(migration, /for update of ss/i);
  assert.match(migration, /create_public_session_booking\(/i);
  assert.doesNotMatch(migration, /create_public_class_enrollment|create_public_class_enquiry/i);
});

test("extends reconciliation with service and scheduled-session identity", () => {
  assert.match(migration, /drop function if exists public\.get_public_booking_by_idempotency_key\(text, text\)/i);
  assert.match(migration, /returns table\s*\([\s\S]*request_fingerprint text,[\s\S]*service_id bigint,[\s\S]*scheduled_session_id bigint,[\s\S]*idempotency_key text/i);
  assert.match(migration, /bk\.service_id, bk\.scheduled_session_id, bk\.idempotency_key/i);
  assert.match(migration, /grant execute on function public\.get_public_booking_by_idempotency_key\(text, text\) to anon, authenticated/i);
});

test("keeps customer answers in validated custom_data and does not backfill rows", () => {
  assert.match(migration, /p_custom_data jsonb/i);
  assert.match(migration, /create_public_session_booking\([\s\S]*p_custom_data\s*\)/i);
  assert.doesNotMatch(migration.slice(0, migration.indexOf("create or replace function")), /\b(insert|update|delete|merge|truncate)\b/i);
  assert.doesNotMatch(migration, /class_enrollments/i);
});

test("migration changes only function/index contract and preserves the existing public path", () => {
  assert.doesNotMatch(migration, /alter table public\.bookings/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.class_enrollments/i);
  assert.match(migration, /create or replace function public\.create_public_session_booking_idempotent/i);
  assert.match(migration, /drop function if exists public\.get_public_booking_by_idempotency_key/i);
});
