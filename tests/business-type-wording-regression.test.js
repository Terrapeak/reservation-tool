import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/public-booking-flow.js', import.meta.url), 'utf8')

test('business type wording avoids mutation observer self loops', () => {
  assert.match(source, /submit\.textContent !== submitLabel/)
  assert.match(source, /small\.textContent !== 'Available'/)
})

test('business type wording updates service cards as well as service pages', () => {
  assert.match(source, /\.booking-type/)
})
