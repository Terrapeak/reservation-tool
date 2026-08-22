import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const flowSource = fs.readFileSync(
  new URL('../src/public-booking-flow.js', import.meta.url),
  'utf8'
)

const bookingSource = fs.readFileSync(
  new URL('../src/public-booking.js', import.meta.url),
  'utf8'
)

test('business type wording avoids mutation observer self loops', () => {
  assert.match(flowSource, /submit\.textContent !== submitLabel/)
  assert.match(flowSource, /small\.textContent !== 'Available'/)
})

test('customer-facing booking labels come from business type at source', () => {
  assert.match(bookingSource, /const businessTypeLabel = business =>/)
  assert.match(
  bookingSource,
  /<span class="booking-type">'\+esc\(businessTypeLabel\(business\)\)/
)

assert.match(
  bookingSource,
  /<p class="booking-kicker">'\+esc\(businessTypeLabel\(business\)\)/
)
})

test('restaurant booking type remains an internal engine routing decision', () => {
  assert.match(
    bookingSource,
    /if\(service\.booking_type==='restaurant'\) return restaurantServicePage/
  )
})
