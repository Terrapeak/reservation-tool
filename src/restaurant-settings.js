import { supabase } from './supabaseclient.js'

const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__
if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const businessId = Number(runtime.businessId)
const businessSlug = String(runtime.businessSlug || '')
const hasCapability = name => runtime.hasCapability?.(name) === true
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

async function loadContext() {
  const [businessResult, profileResult, brandingResult, settingsResult, serviceResult] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', businessId).single(),
    supabase.from('business_profile').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('restaurant_branding').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('restaurant_settings').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('services').select('*').eq('business_id', businessId).eq('booking_type', 'restaurant').eq('is_active', true).order('id').limit(1).maybeSingle()
  ])
  if (businessResult.error || !businessResult.data) throw businessResult.error || new Error('Reservations business not found.')
  return {
    business: businessResult.data,
    profile: profileResult.data || {},
    branding: brandingResult.data || {},
    settings: settingsResult.data || {},
    service: serviceResult.data || null
  }
}

function navigation() {
  const base = `/${businessSlug}/dashboard`
  return `<nav class="admin-nav" aria-label="Reservations management"><a href="${base}">Bookings</a><a href="${base}/analytics">Analytics</a><a class="active" href="${base}/settings">Settings</a></nav>`
}

async function render() {
  const context = await loadContext()
  const canManage = hasCapability('manageSettings')
  const { business, profile, branding, settings, service } = context
  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>Settings</h1>${navigation()}
      ${canManage ? '' : '<p class="read-only-notice">Settings are read-only for this TerraPeak role.</p>'}
      <section class="panel"><h2>Business profile</h2><form id="businessProfileForm">
        <label>Business name<input id="businessName" value="${escapeHtml(profile.business_name || business.business_name)}" ${canManage ? '' : 'disabled'}></label>
        <label>Booking label<input id="bookingLabel" value="${escapeHtml(profile.booking_label || 'Reservation')}" ${canManage ? '' : 'disabled'}></label>
        <label>Customer label<input id="customerLabel" value="${escapeHtml(profile.customer_label || 'Customer')}" ${canManage ? '' : 'disabled'}></label>
        <label>Capacity label<input id="capacityLabel" value="${escapeHtml(profile.capacity_label || 'Guests')}" ${canManage ? '' : 'disabled'}></label>
        <label><input type="checkbox" id="usesCapacity" ${profile.uses_capacity !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'}> Allow group bookings</label>
        ${canManage ? '<button type="submit">Save Business Profile</button>' : ''}
      </form></section>
      <section class="panel"><h2>Restaurant booking service</h2>
        ${service ? `<form id="operationalSettingsForm">
          <label>Opening time<input type="time" id="openingTime" value="${escapeHtml(String(settings.opening_time || '09:00').slice(0, 5))}" ${canManage ? '' : 'disabled'}></label>
          <label>Closing time<input type="time" id="closingTime" value="${escapeHtml(String(settings.closing_time || '17:00').slice(0, 5))}" ${canManage ? '' : 'disabled'}></label>
          <label>Timezone<input id="restaurantTimezone" value="${escapeHtml(settings.timezone || 'Asia/Kuala_Lumpur')}" ${canManage ? '' : 'disabled'}></label>
          <label>Maximum guests per slot<input type="number" min="1" id="maxGuestsPerSlot" value="${Number(service.capacity || 1)}" ${canManage ? '' : 'disabled'}></label>
          <label>Default duration<input type="number" min="1" id="defaultDurationMinutes" value="${Number(service.duration_minutes || 60)}" ${canManage ? '' : 'disabled'}></label>
          <label>Slot interval<input type="number" min="1" id="slotIntervalMinutes" value="${Number(service.slot_interval_minutes || 30)}" ${canManage ? '' : 'disabled'}></label>
          ${canManage ? '<button type="submit">Save Booking Service</button>' : ''}
        </form>` : '<p class="error">The canonical restaurant service is not configured. Run Reservations provisioning before accepting bookings.</p>'}
      </section>
      <section class="panel"><h2>Brand settings</h2><form id="brandingForm">
        <label>Display name<input id="restaurantName" value="${escapeHtml(branding.restaurant_name || profile.business_name || business.business_name)}" ${canManage ? '' : 'disabled'}></label>
        <label>Primary color<input type="color" id="primaryColor" value="${escapeHtml(branding.primary_color || '#2f5d50')}" ${canManage ? '' : 'disabled'}></label>
        ${canManage ? '<button type="submit">Save Brand Settings</button>' : ''}
      </form></section><p id="settingsMessage" role="status"></p>
    </main>`

  if (!canManage) return
  const message = document.querySelector('#settingsMessage')
  document.querySelector('#businessProfileForm').onsubmit = async event => {
    event.preventDefault()
    const payload = {business_name:document.querySelector('#businessName').value.trim(),booking_label:document.querySelector('#bookingLabel').value.trim(),customer_label:document.querySelector('#customerLabel').value.trim(),capacity_label:document.querySelector('#capacityLabel').value.trim(),uses_capacity:document.querySelector('#usesCapacity').checked}
    const { error } = await supabase.from('business_profile').update(payload).eq('business_id', businessId)
    message.textContent = error ? error.message : 'Business profile saved.'
  }
  if (service) document.querySelector('#operationalSettingsForm').onsubmit = async event => {
    event.preventDefault();message.textContent='Saving booking service…'
    const capacity=Number(document.querySelector('#maxGuestsPerSlot').value),duration=Number(document.querySelector('#defaultDurationMinutes').value),interval=Number(document.querySelector('#slotIntervalMinutes').value)
    const serviceResult=await supabase.from('services').update({capacity,duration_minutes:duration,slot_interval_minutes:interval}).eq('id',service.id).eq('business_id',businessId)
    if(serviceResult.error){message.textContent=serviceResult.error.message;return}
    const settingsResult=await supabase.from('restaurant_settings').update({opening_time:document.querySelector('#openingTime').value,closing_time:document.querySelector('#closingTime').value,timezone:document.querySelector('#restaurantTimezone').value.trim(),max_guests_per_slot:capacity,default_duration_minutes:duration}).eq('business_id',businessId)
    message.textContent=settingsResult.error?settingsResult.error.message:'Restaurant booking service saved.'
  }
  document.querySelector('#brandingForm').onsubmit = async event => {
    event.preventDefault()
    const { error } = await supabase.from('restaurant_branding').update({restaurant_name:document.querySelector('#restaurantName').value.trim(),primary_color:document.querySelector('#primaryColor').value}).eq('business_id',businessId)
    message.textContent = error ? error.message : 'Brand settings saved.'
  }
}

await render()
