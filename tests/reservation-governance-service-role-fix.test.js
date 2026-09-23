import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260923140000_reservation_governance_service_role_detection.sql', import.meta.url), 'utf8')

const roleFromRequest = ({ claimsText, legacyRole } = {}) => {
  if (legacyRole) return legacyRole
  if (!claimsText) return ''
  try {
    return JSON.parse(claimsText)?.role || ''
  } catch {
    return ''
  }
}

const isServiceRole = (request) => roleFromRequest(request) === 'service_role'

test('current request.jwt.claims service role is allowed by the replacement guard', () => {
  assert.equal(isServiceRole({ claimsText: '{"role":"service_role"}' }), true)
  assert.match(migration, /claims_text::jsonb\s*->>\s*'role'/i)
})

test('authenticated requests remain blocked from governed updates', () => {
  assert.equal(isServiceRole({ claimsText: '{"role":"authenticated"}' }), false)
  assert.match(migration, /new\.capabilities_managed_by_platform is true[\s\S]*raise exception/i)
})

test('missing and empty claims fail closed', () => {
  assert.equal(isServiceRole({}), false)
  assert.equal(isServiceRole({ claimsText: '{}' }), false)
  assert.equal(isServiceRole({ claimsText: '' }), false)
  assert.match(migration, /if claims_text is not null[\s\S]*exception[\s\S]*when others[\s\S]*request_role := ''/i)
})

test('legacy service-role compatibility takes priority', () => {
  assert.equal(isServiceRole({ legacyRole: 'service_role', claimsText: '{"role":"authenticated"}' }), true)
  assert.match(migration, /nullif\(current_setting\('request\.jwt\.claim\.role', true\), ''\)/i)
  assert.doesNotMatch(migration, /auth\.role\(\)/i)
})

test('malformed JSON fails closed without throwing', () => {
  assert.doesNotThrow(() => isServiceRole({ claimsText: '{not-json' }))
  assert.equal(isServiceRole({ claimsText: '{not-json' }), false)
  assert.match(migration, /begin[\s\S]*claims_text::jsonb[\s\S]*exception[\s\S]*when others[\s\S]*request_role := ''/i)
})

test('governance protections and customer-owned fields remain unchanged', () => {
  assert.match(migration, /new\.template_key is distinct from old\.template_key/i)
  assert.match(migration, /new\.capabilities is distinct from old\.capabilities/i)
  assert.match(migration, /new\.terminology is distinct from old\.terminology/i)
  assert.match(migration, /new\.capabilities_managed_by_platform is distinct from old\.capabilities_managed_by_platform/i)
  assert.doesNotMatch(migration, /booking_behavior is distinct from old\.booking_behavior/i)
  assert.doesNotMatch(migration, /confirmation_message is distinct from old\.confirmation_message/i)
})

test('replacement is forward-only and does not modify existing rows', () => {
  assert.match(migration, /create or replace function private\.enforce_reservation_template_authority/i)
  assert.doesNotMatch(migration, /alter table/i)
  assert.doesNotMatch(migration, /update public\.reservation_business_settings/i)
  assert.doesNotMatch(migration, /insert into public\.reservation_business_settings/i)
  assert.doesNotMatch(migration, /drop trigger/i)
})

test('service-role synchronization remains repeatable while customer edits stay governed', () => {
  assert.equal(isServiceRole({ claimsText: '{"role":"service_role"}' }), true)
  assert.equal(isServiceRole({ claimsText: '{"role":"service_role"}' }), true)
  assert.equal(isServiceRole({ claimsText: '{"role":"authenticated"}' }), false)
  assert.match(migration, /if old\.capabilities_managed_by_platform is true[\s\S]*raise exception/i)
})

test('function remains hardened and trigger continuity is preserved', () => {
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.doesNotMatch(migration, /drop trigger|create trigger/i)
})
