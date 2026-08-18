import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260818123000_phase6_tenant_migration_and_hardening.sql', import.meta.url)

test('tenant migration is explicit, auditable, service-role only, and preserves legacy rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /p_business_id bigint/)
  assert.match(sql, /p_apply boolean default false/)
  assert.match(sql, /booking_model_migration_runs/)
  assert.match(sql, /grant execute[\s\S]*to service_role/)
  assert.match(sql, /booking_model_version = 2/)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.reservations/i)
  assert.doesNotMatch(sql, /drop\s+table\s+public\.reservations/i)
})

test('obsolete legacy management entrypoint is removed', async () => {
  await assert.rejects(access(new URL('../src/main.js', import.meta.url)))
  const entry = await readFile(new URL('../src/management-entry.js', import.meta.url), 'utf8')
  assert.doesNotMatch(entry, /\.\/main\.js/)
})
