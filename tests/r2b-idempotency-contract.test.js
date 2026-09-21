import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('R2B adds a tenant-scoped idempotent appointment RPC without changing legacy RPCs', async () => {
  const sql = await read('supabase/migrations/20260921100000_idempotent_public_appointment_booking.sql')
  assert.match(sql, /alter table public\.bookings[\s\S]*add column if not exists idempotency_key text/i)
  assert.match(sql, /add column if not exists idempotency_request_fingerprint text/i)
  assert.match(sql, /create unique index if not exists bookings_business_idempotency_key_unique[\s\S]*on public\.bookings \(business_id, idempotency_key\)[\s\S]*where idempotency_key is not null/i)
  assert.match(sql, /create or replace function public\.create_public_booking_idempotent\([\s\S]*p_custom_data jsonb[\s\S]*p_idempotency_key text[\s\S]*p_request_fingerprint text/i)
  assert.match(sql, /where business_id = v_business_id and idempotency_key = v_key/i)
  assert.match(sql, /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/i)
  assert.match(sql, /idempotency_request_fingerprint/i)
  assert.match(sql, /when unique_violation then[\s\S]*return query select v_existing\.id/i)
  assert.match(sql, /get_public_booking_by_idempotency_key[\s\S]*booking_status[\s\S]*request_fingerprint/i)
  assert.match(sql, /revoke all on function public\.create_public_booking_idempotent\([\s\S]*jsonb,\s*text\s*\)/i)
})
