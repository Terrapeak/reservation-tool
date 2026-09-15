import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RESERVATIONS_MANAGEMENT_ROUTES,
  RESERVATIONS_MANAGEMENT_ROUTE_SET,
  RESERVATIONS_NAVIGATION,
  RESERVATIONS_NAVIGATION_CONTRACT,
  getReservationsNavigation,
} from '../src/reservations-routes.js'
import { getVisibleNavigation } from '../src/reservation-journey.js'

test('canonical navigation keys and ordering are unique and stable', () => {
  const keys = RESERVATIONS_NAVIGATION.map(item => item.key)
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual(keys, [
    'bookings',
    'services',
    'staff',
    'schedule',
    'availability',
    'analytics',
    'customerForm',
    'bookingSettings',
  ])
  assert.deepEqual(
    RESERVATIONS_NAVIGATION.map(item => item.route),
    [
      'admin',
      'admin/analytics',
      'admin/services',
      'admin/staff',
      'admin/schedule',
      'admin/availability',
      'admin/customer-form',
      'admin/settings',
    ],
  )
})

test('canonical contract carries valid grouping and product metadata', () => {
  const groups = new Set(['OPERATIONS', 'INSIGHTS', 'BOOKING_SETUP', 'BOOKING_PAGE'])
  for (const item of RESERVATIONS_NAVIGATION_CONTRACT) {
    assert.ok(item.key)
    assert.ok(groups.has(item.group))
    assert.ok(Number.isInteger(item.order))
    assert.ok(item.productArea)
    if (item.renderInReservationTool) {
      assert.equal(typeof item.route, 'string')
      assert.ok(item.route.length > 0)
      assert.equal(item.implemented, true)
    }
  }
})

test('future compatibility entries are metadata-only and never rendered', () => {
  const rendered = getReservationsNavigation()
  assert.equal(rendered.some(item => item.key === 'callbackRequests'), false)
  assert.equal(rendered.some(item => item.key === 'preview'), false)
  assert.equal(rendered.some(item => item.key === 'shareEmbed'), false)
  assert.equal(rendered.some(item => item.key === 'notifications'), false)
  assert.equal(
    RESERVATIONS_NAVIGATION_CONTRACT.find(item => item.key === 'callbackRequests').ownership,
    'dashboard_compatibility',
  )
})

test('existing management routes remain stable', () => {
  assert.deepEqual(Object.values(RESERVATIONS_MANAGEMENT_ROUTES).sort(), [
    'admin',
    'admin/analytics',
    'admin/availability',
    'admin/customer-form',
    'admin/schedule',
    'admin/services',
    'admin/settings',
    'admin/staff',
  ].sort())
  for (const route of Object.values(RESERVATIONS_MANAGEMENT_ROUTES)) {
    assert.equal(RESERVATIONS_MANAGEMENT_ROUTE_SET.has(route), true)
  }
})

test('capability filtering keeps conditional destinations hidden', () => {
  const navigation = getReservationsNavigation({
    capabilities: {
      services: false,
      teamResources: false,
      scheduledSessions: false,
    },
  })
  assert.deepEqual(
    navigation.map(item => item.key),
    ['bookings', 'availability', 'analytics', 'customerForm', 'bookingSettings'],
  )
  assert.deepEqual(
    getVisibleNavigation(RESERVATIONS_NAVIGATION, {
      services: false,
      teamResources: false,
      scheduledSessions: false,
    }).map(item => item.key),
    ['bookings', 'analytics', 'customerForm', 'bookingSettings'],
  )
})

test('all current entries remain renderable and no duplicate routes are introduced', () => {
  assert.equal(RESERVATIONS_NAVIGATION.every(item => typeof item.route === 'string' && item.route), true)
  assert.equal(new Set(RESERVATIONS_NAVIGATION.map(item => item.route)).size, RESERVATIONS_NAVIGATION.length)
})
