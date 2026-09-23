import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260923100000_reservation_governance_marker_enforcement.sql', import.meta.url), 'utf8')

test('governance migration adds a legacy-default Platform authority marker', () => {
  assert.match(migration, /add column if not exists capabilities_managed_by_platform boolean not null default false/i)
  assert.match(migration, /comment on column public\.reservation_business_settings\.capabilities_managed_by_platform/i)
  assert.doesNotMatch(migration, /update public\.reservation_business_settings[\s\S]*set capabilities_managed_by_platform\s*=\s*true/i)
})

test('governance trigger protects Platform fields but preserves customer-owned settings', () => {
  assert.match(migration, /create or replace function private\.enforce_reservation_template_authority/i)
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\)\s*=\s*'service_role'/i)
  assert.match(migration, /new\.template_key is distinct from old\.template_key/i)
  assert.match(migration, /new\.capabilities is distinct from old\.capabilities/i)
  assert.match(migration, /new\.terminology is distinct from old\.terminology/i)
  assert.match(migration, /new\.capabilities_managed_by_platform is distinct from old\.capabilities_managed_by_platform/i)
  assert.match(migration, /before insert or update of template_key, capabilities, terminology, capabilities_managed_by_platform/i)
  assert.doesNotMatch(migration, /booking_behavior is distinct from old\.booking_behavior/i)
  assert.doesNotMatch(migration, /confirmation_message is distinct from old\.confirmation_message/i)
})

test('authenticated inserts cannot spoof Platform authority', () => {
  assert.match(migration, /tg_op = 'INSERT'[\s\S]*new\.capabilities_managed_by_platform is true[\s\S]*raise exception/i)
  assert.match(migration, /new\.capabilities_managed_by_platform := false/i)
})
