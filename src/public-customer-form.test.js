import { describe, expect, it } from 'vitest'

const renderField = (field, name) => {
  const required = field.is_required ? ' required' : ''
  if (field.field_type === 'textarea') return `<textarea name="${name}"${required}></textarea>`
  if (field.field_type === 'dropdown') {
    const options = String(field.field_options || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean)
    return `<select name="${name}"${required}>${options.map(v => `<option>${v}</option>`).join('')}</select>`
  }
  return `<input name="${name}"${required}>`
}

describe('public Customer Form field rendering', () => {
  it('renders required physio textarea fields', () => {
    expect(renderField({ field_type: 'textarea', is_required: true }, 'custom_133')).toContain('required')
  })

  it('renders every dropdown option', () => {
    const html = renderField({ field_type: 'dropdown', field_options: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10' }, 'custom_137')
    expect(html).toContain('<option>10</option>')
    expect((html.match(/<option>/g) || []).length).toBe(10)
  })
})
