import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { RESERVATIONS_MANAGEMENT_ROUTES, RESERVATIONS_MANAGEMENT_ROUTE_SET } from '../src/reservations-routes.js'

const indexUrl = new URL('../index.html', import.meta.url)
const entryUrl = new URL('../src/management-entry.js', import.meta.url)
const formUrl = new URL('../src/customer-form-admin.js', import.meta.url)
const runtimeUrl = new URL('../src/trusted-management-runtime.js', import.meta.url)
const migrationUrl = new URL('../supabase/migrations/20260821183000_customer_form_atomic_save.sql', import.meta.url)

test('all declared Reservations management routes are bootstrapped from the shared registry', async () => {
  const index = await readFile(indexUrl, 'utf8')
  const entry = await readFile(entryUrl, 'utf8')
  assert.equal(RESERVATIONS_MANAGEMENT_ROUTES.customerForm, 'admin/customer-form')
  assert.equal(RESERVATIONS_MANAGEMENT_ROUTE_SET.size, 8)
  assert.match(index, /RESERVATIONS_MANAGEMENT_ROUTE_SET/)
  assert.doesNotMatch(index, /new Set\(\['admin'/)
  assert.match(entry, /RESERVATIONS_MANAGEMENT_ROUTE_SET/)
  assert.match(entry, /RESERVATIONS_ROUTE_GROUPS\.customerForm/)
})

test('Customer Form uses canonical dropdown fields with editable options and atomic persistence', async () => {
  const form = await readFile(formUrl, 'utf8')
  const runtime = await readFile(runtimeUrl, 'utf8')
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(form, /value="dropdown"/)
  assert.match(form, /draft-options/)
  assert.match(form, /save_booking_customer_form/)
  assert.doesNotMatch(form, /\.from\('booking_custom_fields'\)\.update\(payload\)/)
  assert.match(runtime, /save_booking_customer_form:'manageSettings'/)
  assert.match(runtime, /p_business_id:trustedBusinessId/)
  assert.match(migration, /security definer/)
  assert.match(migration, /private\.has_business_role/)
  assert.match(migration, /is_locked/)
})
