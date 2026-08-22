import { supabase } from './supabaseclient.js'

const route = window.location.pathname.split('/').filter(Boolean)
const businessSlug = route[0]?.toLowerCase() === 'book' ? route[1] : null

if (businessSlug) installCustomerForm()

async function installCustomerForm() {
  const [{ data: fields = [], error }, { data: businesses = [] }] = await Promise.all([
    supabase.rpc('get_public_booking_custom_fields', { p_business_slug: businessSlug }),
    supabase.rpc('get_public_booking_business', { p_business_slug: businessSlug }),
  ])
  if (error) return

  const business = businesses?.[0]
  const businessType = String(business?.business_type || 'general').toLowerCase()
  const isRestaurantBusiness = businessType === 'restaurant'
  const system = Object.fromEntries(fields.filter(f => f.system_key).map(f => [f.system_key, f]))
  const custom = fields.filter(f => !f.system_key)

  const originalRpc = supabase.rpc.bind(supabase)
  supabase.rpc = (fn, args = {}, options) => {
    if (fn === 'create_public_restaurant_reservation') {
      const form = document.querySelector('#publicBookingForm')
      if (form) {
        const values = new FormData(form)
        const customData = { ...(args.p_custom_data || {}) }
        if (system.customer_email) customData.customer_email = values.get('customer_email') || values.get('email') || null
        custom.forEach(field => {
          const key = `custom_${field.id}`
          if (field.field_type === 'checkbox') customData[String(field.id)] = values.get(key) === 'on'
          else customData[String(field.id)] = values.get(key) || null
        })
        args = { ...args, p_custom_data: customData }
      }
    }
    return originalRpc(fn, args, options)
  }

  function apply() {
    const form = document.querySelector('#publicBookingForm')
    if (!form || form.dataset.customerFormApplied === '1') return
    form.dataset.customerFormApplied = '1'

    if (!isRestaurantBusiness) {
      const quantity = form.elements?.quantity
      const quantityLabel = quantity?.closest('label')
      if (quantityLabel) {
        const hiddenQuantity = document.createElement('input')
        hiddenQuantity.type = 'hidden'
        hiddenQuantity.name = 'quantity'
        hiddenQuantity.value = '1'
        quantityLabel.replaceWith(hiddenQuantity)
      }
      const notes = form.elements?.notes
      notes?.closest('label')?.remove()
    }

    const name = form.querySelector('input[name="name"]')
    const phone = form.querySelector('input[name="phone"]')
    const email = form.querySelector('input[name="email"]')
    if (name && system.customer_name) {
      name.required = Boolean(system.customer_name.is_required)
      name.closest('label').firstChild.textContent = system.customer_name.field_label
    }
    if (phone && system.customer_phone) {
      phone.required = Boolean(system.customer_phone.is_required)
      phone.closest('label').firstChild.textContent = system.customer_phone.field_label
    }
    if (email && system.customer_email) {
      email.required = Boolean(system.customer_email.is_required)
      email.closest('label').firstChild.textContent = system.customer_email.field_label
    } else if (system.customer_email) {
      const grid = form.querySelector('.form-grid')
      if (grid) grid.insertAdjacentHTML('beforeend', renderField(system.customer_email, 'customer_email'))
    }

    if (custom.length) {
      const anchor = form.querySelector('button.booking-confirm')
      const wrapper = document.createElement('div')
      wrapper.className = 'customer-form-fields'
      wrapper.innerHTML = custom.map(field => renderField(field, `custom_${field.id}`)).join('')
      anchor?.insertAdjacentElement('beforebegin', wrapper)
    }
  }

  apply()
  const observer = new MutationObserver(apply)
  observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true })
}

function renderField(field, name) {
  const required = field.is_required ? ' required' : ''
  const mark = field.is_required ? ' *' : ''
  const label = escapeHtml(field.field_label) + mark
  if (field.field_type === 'textarea') return `<label>${label}<textarea name="${name}" maxlength="2000"${required}></textarea></label>`
  if (field.field_type === 'dropdown') {
    const options = String(field.field_options || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean)
    return `<label>${label}<select name="${name}"${required}><option value="">Select</option>${options.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select></label>`
  }
  if (field.field_type === 'checkbox') return `<label class="booking-checkbox"><input type="checkbox" name="${name}"${required}> ${label}</label>`
  const type = field.system_key === 'customer_email' ? 'email' : 'text'
  return `<label>${label}<input type="${type}" name="${name}" maxlength="320"${required}></label>`
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]))
}