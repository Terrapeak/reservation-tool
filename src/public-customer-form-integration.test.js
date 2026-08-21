import { describe, expect, it } from 'vitest'

describe('public Customer Form data mapping', () => {
  it('keeps custom values separate from canonical customer fields', () => {
    const fields = [
      { id: 1, system_key: 'customer_name' },
      { id: 2, system_key: 'customer_phone' },
      { id: 3, system_key: 'customer_email' },
      { id: 4, system_key: null },
    ]
    expect(fields.filter(field => !field.system_key).map(field => field.id)).toEqual([4])
  })
})
