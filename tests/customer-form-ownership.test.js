import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const adminUrl = new URL('../src/customer-form-admin.js', import.meta.url)
const contractUrl = new URL('../src/customer-form-contract.js', import.meta.url)
const migrationUrl = new URL('../supabase/migrations/20260924110000_customer_form_ownership_rpc.sql', import.meta.url)

test('Customer Form UI marks new fields as customer-owned without trusting client provenance', async () => {
  const admin = await readFile(adminUrl, 'utf8')
  assert.match(admin, /field_source:'customer'/)
  assert.doesNotMatch(admin, /p_fields:.*field_source/)
  assert.match(admin, /save_booking_customer_form/)
})

test('Customer Form UI protects template and system metadata while retaining ordering controls', async () => {
  const admin = await readFile(adminUrl, 'utf8')
  assert.match(admin, /f\.field_source==='template'/)
  assert.match(admin, /Managed by template/)
  assert.match(admin, /data-action="up"/)
  assert.match(admin, /data-action="down"/)
  assert.match(admin, /field_source==='system'/)
})

test('Customer Form normalization preserves provenance metadata', async () => {
  const contract = await readFile(contractUrl, 'utf8')
  assert.match(contract, /field_source:/)
  assert.match(contract, /template_key:/)
  assert.match(contract, /template_field_key:/)
})

test('ownership RPC assigns customer to new rows and preserves existing ownership', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /field_source,\s*\n\s*template_key,\s*\n\s*template_field_key/i)
  assert.match(migration, /'customer',\s*\n\s*null,\s*\n\s*null/i)
  assert.match(migration, /existing\.field_source in \('template', 'system'\)/)
  assert.match(migration, /field_source in \('customer', 'legacy'\)/)
  assert.doesNotMatch(migration, /field->>'field_source'/)
  assert.doesNotMatch(migration, /field->>'template_key'/)
  assert.doesNotMatch(migration, /field->>'template_field_key'/)
})

test('ownership RPC preserves atomic save and safe old-client compatibility', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /create or replace function public\.save_booking_customer_form/)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /seen_ids bigint\[\]/)
  assert.match(migration, /grant execute on function public\.save_booking_customer_form\(bigint, jsonb\) to authenticated/i)
})
