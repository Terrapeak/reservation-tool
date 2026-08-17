import test from 'node:test'
import assert from 'node:assert/strict'

import { bookingDateTimeParts } from '../src/booking-timezone.js'

test('renders canonical restaurant timestamps in the configured business timezone', () => {
  assert.deepEqual(
    bookingDateTimeParts('2026-08-18T11:00:00.000Z', 'Asia/Kuala_Lumpur'),
    { bookingDate: '2026-08-18', bookingTime: '19:00' }
  )
})
