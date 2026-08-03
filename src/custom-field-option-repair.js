import { supabase } from './supabaseclient.js'

const optionLabel = (option) => {
  if (option === undefined || option === null) return ''
  if (typeof option === 'object') {
    return String(option.label ?? option.name ?? option.value ?? option.text ?? '').trim()
  }
  return String(option).trim()
}

const normalizeOptions = (value) => {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value.map(optionLabel).filter(Boolean)

  if (typeof value === 'object') {
    return normalizeOptions(value.options ?? value.choices ?? value.values ?? value.items ?? [])
  }

  const text = String(value).trim()
  if (!text) return []

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return normalizeOptions(JSON.parse(text))
    } catch {
      // Continue with legacy text parsing.
    }
  }

  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

const getFieldOptions = (field) => normalizeOptions(
  field.field_options ?? field.options ?? field.dropdown_options ?? field.choices
)

async function loadDropdownFields() {
  const slug = window.location.pathname.split('/').filter(Boolean)[0] || 'dim-sum-dragon'

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('business_slug', slug)
    .maybeSingle()

  if (businessError || !business) return []

  const { data, error } = await supabase
    .from('booking_custom_fields')
    .select('*')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .eq('field_type', 'dropdown')
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Could not load dropdown options:', error)
    return []
  }

  return data || []
}

function populateDropdown(field) {
  const select = document.getElementById(`custom-${field.id}`)
  if (!select || select.dataset.optionsRepaired === 'true') return

  const options = getFieldOptions(field)
  if (!options.length) return

  const currentValue = select.value
  select.innerHTML = '<option value="">Select an option</option>'

  options.forEach((option) => {
    const element = document.createElement('option')
    element.value = option
    element.textContent = option
    select.appendChild(element)
  })

  if (currentValue && options.includes(currentValue)) select.value = currentValue
  select.dataset.optionsRepaired = 'true'
}

async function repairDropdowns() {
  const fields = await loadDropdownFields()
  fields.forEach(populateDropdown)
}

let repairTimer
const scheduleRepair = () => {
  window.clearTimeout(repairTimer)
  repairTimer = window.setTimeout(repairDropdowns, 50)
}

const observer = new MutationObserver(scheduleRepair)
observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('DOMContentLoaded', scheduleRepair)
scheduleRepair()
