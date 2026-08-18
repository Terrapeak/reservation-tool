import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('management store has no legacy reservation read or write path', async () => {
  const source = await readFile(new URL('../src/booking-management-store.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from\(['"]reservations['"]\)/)
  assert.doesNotMatch(source, /booking_model_version/)
  assert.doesNotMatch(source, /normalizeLegacyReservation|setLegacyBookingArchived/)
})

test('legacy table finalization blocks every mutation and preserves the table', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260818140000_freeze_legacy_reservations.sql', import.meta.url), 'utf8')
  assert.match(sql, /before insert or update or delete/i)
  assert.match(sql, /revoke insert, update, delete/i)
  assert.doesNotMatch(sql, /drop table/i)
  assert.doesNotMatch(sql, /delete from public\.reservations/i)
})
