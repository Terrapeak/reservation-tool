import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260924130000_customer_form_rpc_field_type_fix.sql', import.meta.url)
const canonicalUrl = new URL('../supabase/migrations/20260908103000_customer_form_booking_contract.sql', import.meta.url)

async function readMigration() {
  return readFile(migrationUrl, 'utf8')
}

test('ownership RPC restores exactly the canonical eight field types', async () => {
  const [migration, canonical] = await Promise.all([readMigration(), readFile(canonicalUrl, 'utf8')])
  const expected = "'text', 'textarea', 'dropdown', 'checkbox', 'email', 'phone', 'number', 'date'"
  assert.match(migration, new RegExp(`requested_type not in \\(${expected}\\)`))
  assert.match(canonical, new RegExp(`requested_type not in \\(${expected}\\)`))
  assert.doesNotMatch(migration, /'file'/)
})

test('system Full name, Phone, and Email payload types pass validation', async () => {
  const migration = await readMigration()
  const systemFields = [
    { field_label: 'Full name', field_type: 'text' },
    { field_label: 'Phone', field_type: 'phone' },
    { field_label: 'Email', field_type: 'email' },
  ]
  const allowlist = migration.match(/requested_type not in \(([^)]+)\)/i)?.[1] || ''
  for (const field of systemFields) {
    assert.match(allowlist, new RegExp(`'${field.field_type}'`))
    assert.match(migration, new RegExp(`Unsupported Customer Form field type`))
  }
})

test('unsupported field types still fail closed', async () => {
  const migration = await readMigration()
  assert.match(migration, /raise exception 'Unsupported Customer Form field type: %'/)
  assert.doesNotMatch(migration, /requested_type not in \([^)]*'file'/i)
})

test('ownership protection and omission semantics remain unchanged', async () => {
  const migration = await readMigration()
  assert.match(migration, /existing\.field_source in \('template', 'system'\)/)
  assert.match(migration, /set display_order = requested_order/)
  assert.match(migration, /field_source in \('customer', 'legacy'\)/)
  assert.doesNotMatch(migration, /field->>'field_source'/)
  assert.doesNotMatch(migration, /field->>'template_key'/)
  assert.doesNotMatch(migration, /field->>'template_field_key'/)
})

test('customer additions and provenance-safe existing updates remain intact', async () => {
  const migration = await readMigration()
  assert.match(migration, /'customer',\s*\n\s*null,\s*\n\s*null/i)
  assert.match(migration, /where id = requested_id and business_id = p_business_id/)
  assert.match(migration, /seen_ids bigint\[\]/)
  assert.match(migration, /grant execute on function public\.save_booking_customer_form\(bigint, jsonb\) to authenticated/i)
})

test('corrective migration changes only the RPC definition', async () => {
  const migration = await readMigration()
  assert.match(migration, /create or replace function public\.save_booking_customer_form/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.doesNotMatch(migration, /insert into public\.(bookings|reservation_business_settings)/i)
  assert.doesNotMatch(migration, /delete from/i)
})
