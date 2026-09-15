import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  RESERVATIONS_MANAGEMENT_ROUTES,
  RESERVATIONS_NAVIGATION,
  RESERVATIONS_NAVIGATION_CONTRACT,
  getReservationsNavigation,
} from '../src/reservations-routes.js'

const shellUrl = new URL('../src/reservations-management-shell.js', import.meta.url)

test('grouped navigation renders only implemented reservation-tool areas', async () => {
  const shell = await readFile(shellUrl, 'utf8')
  assert.match(shell, /NAVIGATION_GROUP_LABELS/)
  assert.match(shell, /reservations-nav-group/)
  assert.match(shell, /getVisibleNavigation\(RESERVATIONS_NAVIGATION, capabilities\)/)
  assert.doesNotMatch(shell, /callbackRequests/)
  assert.doesNotMatch(shell, /shareEmbed/)
})

test('implemented navigation groups and routes are canonical and ordered', () => {
  assert.deepEqual(
    RESERVATIONS_NAVIGATION.map(item => [item.group, item.key, item.route]),
    [
      ['OPERATIONS', 'bookings', RESERVATIONS_MANAGEMENT_ROUTES.bookings],
      ['BOOKING_SETUP', 'services', RESERVATIONS_MANAGEMENT_ROUTES.services],
      ['BOOKING_SETUP', 'staff', RESERVATIONS_MANAGEMENT_ROUTES.staff],
      ['BOOKING_SETUP', 'schedule', RESERVATIONS_MANAGEMENT_ROUTES.schedule],
      ['BOOKING_SETUP', 'availability', RESERVATIONS_MANAGEMENT_ROUTES.availability],
      ['INSIGHTS', 'analytics', RESERVATIONS_MANAGEMENT_ROUTES.analytics],
      ['BOOKING_SETUP', 'customerForm', RESERVATIONS_MANAGEMENT_ROUTES.customerForm],
      ['BOOKING_SETUP', 'bookingSettings', RESERVATIONS_MANAGEMENT_ROUTES.settings],
    ],
  )
  assert.equal(new Set(RESERVATIONS_NAVIGATION.map(item => item.route)).size, RESERVATIONS_NAVIGATION.length)
})

test('target groups are metadata-capable without empty or broken entries', () => {
  const supported = new Set(['OPERATIONS', 'INSIGHTS', 'BOOKING_SETUP', 'BOOKING_PAGE'])
  assert.ok(RESERVATIONS_NAVIGATION_CONTRACT.every(item => supported.has(item.group)))
  assert.ok(getReservationsNavigation().every(item => item.implemented && typeof item.route === 'string' && item.route))
  assert.equal(getReservationsNavigation().some(item => item.key === 'callbackRequests'), false)
  assert.equal(getReservationsNavigation().some(item => item.key === 'preview'), false)
  assert.equal(getReservationsNavigation().some(item => item.key === 'shareEmbed'), false)
  assert.equal(getReservationsNavigation().some(item => item.key === 'notifications'), false)
})

test('capability filtering still hides Services, Team and Scheduled only when disabled', () => {
  const visible = getReservationsNavigation({
    capabilities: { services: false, teamResources: false, scheduledSessions: false },
  })
  assert.deepEqual(visible.map(item => item.key), [
    'bookings',
    'availability',
    'analytics',
    'customerForm',
    'bookingSettings',
  ])
})
