import { describe, expect, it } from 'vitest'

describe('public Customer Form exposure', () => {
  it('requires only presentation metadata for rendering', () => {
    const exposed = ['id','field_label','field_type','field_options','is_required','display_order','system_key']
    expect(exposed).not.toContain('business_id')
    expect(exposed).not.toContain('created_at')
  })
})
