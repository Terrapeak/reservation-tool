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

function showSettingsMessage(message, isError = false) {
  const messageBox = document.getElementById('brandingMessage')
  if (!messageBox) return
  messageBox.innerHTML = `<p style="color:${isError ? 'red' : 'green'}">${message}</p>`
}

// The original settings editor did not restore field_options when Edit Field
// was clicked. Preserve the saved options so users can review and update them.
document.addEventListener('click', (event) => {
  const button = event.target.closest('.edit-field-button')
  if (!button) return

  const optionsInput = document.getElementById('customFieldOptions')
  if (optionsInput) {
    optionsInput.value = button.dataset.options || ''
  }
}, true)

// Prevent empty dropdowns from being created or updated. An empty dropdown is
// unusable in both the public form and chatbot.
document.addEventListener('submit', (event) => {
  const form = event.target
  if (form?.id !== 'customFieldForm') return

  const type = document.getElementById('customFieldType')?.value
  if (type !== 'dropdown') return

  const optionsInput = document.getElementById('customFieldOptions')
  const options = normalizeOptions(optionsInput?.value || '')

  if (!options.length) {
    event.preventDefault()
    event.stopImmediatePropagation()
    showSettingsMessage(
      'Please enter at least one dropdown option. Add one option per line.',
      true
    )
    optionsInput?.focus()
  }
}, true)

let repairTimer
const scheduleRepair = () => {
  window.clearTimeout(repairTimer)
  repairTimer = window.setTimeout(repairDropdowns, 50)
}

const observer = new MutationObserver(scheduleRepair)
observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('DOMContentLoaded', scheduleRepair)
scheduleRepair()
