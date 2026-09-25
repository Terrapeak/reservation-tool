import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL(
  "../supabase/migrations/20260925120000_extend_idempotency_reconciliation_lookup.sql",
  import.meta.url,
), "utf8");
const previousMigration = await readFile(new URL(
  "../supabase/migrations/20260921100000_idempotent_public_appointment_booking.sql",
  import.meta.url,
), "utf8");

const originalColumns = [
  "booking_id uuid",
  "reference text",
  "starts_at timestamptz",
  "ends_at timestamptz",
  "booking_status text",
  "business_id bigint",
  "request_fingerprint text",
];
const addedColumns = ["service_id bigint", "scheduled_session_id bigint", "idempotency_key text"];
const executableSql = migration
  .replace(/--[^\r\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

test("uses exactly the two-parameter lookup signature with no overload", () => {
  assert.match(migration, /create function public\.get_public_booking_by_idempotency_key\(\s*p_business_slug text,\s*p_idempotency_key text\s*\)/i);
  assert.match(migration, /drop function if exists public\.get_public_booking_by_idempotency_key\(text, text\);/i);
  assert.equal((migration.match(/create function public\.get_public_booking_by_idempotency_key\(/gi) || []).length, 1);
});

test("preserves the original seven lookup columns and appends identity fields", () => {
  const returnShape = migration.match(/returns table\s*\(([\s\S]*?)\)\s*language sql/i)?.[1] || "";
  const normalized = returnShape.replace(/\s+/g, " ").trim();
  assert.equal(normalized, [...originalColumns, ...addedColumns].join(", "));
});

test("replaces the old return shape without changing the function identity", () => {
  assert.match(migration, /drop function if exists public\.get_public_booking_by_idempotency_key\(text, text\);/i);
  assert.match(migration, /create function public\.get_public_booking_by_idempotency_key\(/i);
  assert.match(previousMigration, /returns table\s*\([\s\S]*request_fingerprint text/i);
});

test("returns authoritative booking identity by business and idempotency key", () => {
  const select = migration.match(/select([\s\S]*?)from public\.bookings/i)?.[1] || "";
  assert.match(select, /bk\.service_id/i);
  assert.match(select, /bk\.scheduled_session_id/i);
  assert.match(select, /bk\.idempotency_key/i);
  assert.match(select, /bk\.idempotency_request_fingerprint/i);
  assert.match(migration, /lower\(b\.business_slug\) = lower\(p_business_slug\)/i);
  assert.match(migration, /bk\.idempotency_key = nullif\(btrim\(p_idempotency_key\), ''\)/i);
  assert.doesNotMatch(migration, /where\s+bk\.idempotency_key\s*=\s*nullif[\s\S]*and\s+lower\(b\.business_slug/i);
});

test("supports appointment and Restaurant rows structurally with nullable session identity", () => {
  // Static contract only: no live appointment/Restaurant database integration is available.
  assert.doesNotMatch(migration, /join\s+public\.scheduled_sessions/i);
  assert.match(migration, /select[\s\S]*bk\.scheduled_session_id[\s\S]*from public\.bookings/i);
  assert.doesNotMatch(migration, /scheduled_session_id\s+bigint\s+not null/i);
});

test("supports scheduled-session recovery with the authoritative occurrence ID", () => {
  // Static contract only: runtime scheduled-session lookup is a later acceptance test.
  const select = migration.match(/select([\s\S]*?)from public\.bookings/i)?.[1] || "";
  assert.match(select, /bk\.service_id[\s\S]*bk\.scheduled_session_id/i);
  assert.match(select, /bk\.scheduled_session_id/i);
});

test("preserves security and grants", () => {
  assert.match(migration, /language sql\s+security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.get_public_booking_by_idempotency_key\(text, text\) from public/i);
  const createIndex = migration.indexOf("create function public.get_public_booking_by_idempotency_key");
  const grantIndex = migration.indexOf("grant execute on function public.get_public_booking_by_idempotency_key");
  assert.ok(grantIndex > createIndex, "grants must be restored after recreation");
  assert.match(migration, /grant execute on function public\.get_public_booking_by_idempotency_key\(text, text\) to anon, authenticated/i);
});

test("contains no booking-row DML, backfill, cascade, or class-enrollment path", () => {
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|merge|truncate)\b/i);
  assert.doesNotMatch(executableSql, /cascade|class_enrollments|create_public_class_enrollment|create_public_class_enquiry/i);
  assert.doesNotMatch(migration, /drop function[^;]*cascade/i);
});

test("exposes the fields needed for ambiguous scheduled-session recovery", () => {
  const returnShape = migration.match(/returns table\s*\(([\s\S]*?)\)\s*language sql/i)?.[1] || "";
  const required = ["booking_id", "reference", "booking_status", "service_id", "scheduled_session_id", "idempotency_key", "request_fingerprint"];
  for (const field of required) assert.match(returnShape, new RegExp(`\\b${field}\\b`, "i"));
});
