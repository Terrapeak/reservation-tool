import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('management UI does not expose migration-era booking labels', async () => {
  const source = await read('../src/unified-bookings-admin.js')
  assert.doesNotMatch(source, /Unified booking|Unified Model|Legacy Records|Legacy reservation/)
})

test('unified shell retains management styling after removing internal navigation', async () => {
  const source = await read('../src/reservations-management-shell.js')
  const styles = await read('../src/reservations-management-shell.css')
  assert.match(source, /reservations-admin-style-marker/)
  assert.match(styles, /reservations-admin-style-marker[\s\S]*display:\s*none\s*!important/)
})

test('booking controls remain capability-aware and analytics fails closed', async () => {
  const bookings = await read('../src/unified-bookings-admin.js')
  const capabilities = await read('../src/management-capability-ui.js')
  assert.match(bookings, /hasCapability\('manageBookings'\)/)
  assert.match(bookings, /hasCapability\('viewAnalytics'\)/)
  assert.match(capabilities, /manageSettings/)
  assert.match(capabilities, /manageServices/)
  assert.match(capabilities, /manageTeam/)
  assert.match(capabilities, /manageOwnAvailability/)
})

test('restaurant-only settings are rendered only when a restaurant service exists', async () => {
  const source = await read('../src/restaurant-settings.js')
  assert.match(source, /\$\{service \? `<section class="panel"><h2>Restaurant booking service/)
  assert.match(source, /if \(service\) document\.querySelector\('#brandingForm'\)/)
})
