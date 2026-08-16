import { supabase } from './supabaseclient.js'

const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__
if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const businessId = Number(runtime.businessId)
const businessSlug = String(runtime.businessSlug || '')
const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')
const hasCapability = (name) => runtime.hasCapability?.(name) === true

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderNav(active) {
  const base = `/${businessSlug}/dashboard`
  return `
    <nav class="admin-nav" aria-label="Reservations management">
      <a class="${active === 'bookings' ? 'active' : ''}" href="${base}">Bookings</a>
      <a class="${active === 'analytics' ? 'active' : ''}" href="${base}/analytics">Analytics</a>
      <a class="${active === 'settings' ? 'active' : ''}" href="${base}/settings">Settings</a>
    </nav>
  `
}

async function loadBusinessContext() {
  const [{ data: business, error: businessError }, { data: profile }, { data: branding }, { data: settings }] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', businessId).single(),
    supabase.from('business_profile').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('restaurant_branding').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('restaurant_settings').select('*').eq('business_id', businessId).maybeSingle()
  ])

  if (businessError || !business) throw businessError || new Error('Reservations business not found.')

  return {
    business,
    profile: profile || {
      business_name: business.business_name,
      booking_label: 'Reservation',
      customer_label: 'Customer',
      capacity_label: 'Guests',
      uses_capacity: true
    },
    branding: branding || {},
    settings: settings || {}
  }
}

function renderStatus(status) {
  const labels = {
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No Show'
  }
  return labels[status] || status || 'Unknown'
}

async function renderBookings(context) {
  const canManage = hasCapability('manageBookings')
  const today = new Date().toISOString().split('T')[0]

  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>${escapeHtml(context.profile.business_name)} Reservations</h1>
      ${renderNav('bookings')}

      <div class="analytics-filter-panel">
        <label>Start Date<input type="date" id="adminStartDateFilter" value="${today}"></label>
        <label>End Date<input type="date" id="adminEndDateFilter" value="${today}"></label>
        <button id="loadDateButton" type="button">Load Date Range</button>
      </div>

      <div>
        <input id="searchReference" type="text" placeholder="Search by reference number">
        <button id="searchButton" type="button">Search</button>
        <button id="refreshButton" type="button">Show All ${escapeHtml(context.profile.booking_label)}s</button>
      </div>

      <div>
        <button id="showActiveButton" type="button">Active</button>
        <button id="showArchivedButton" type="button">Archived</button>
        <button id="showAllButton" type="button">All</button>
      </div>

      <div id="dashboardSummary"></div>
      <div id="adminReservations">Loading reservations...</div>
    </main>
  `

  const startInput = document.getElementById('adminStartDateFilter')
  const endInput = document.getElementById('adminEndDateFilter')
  const target = document.getElementById('adminReservations')
  const summary = document.getElementById('dashboardSummary')
  let viewMode = 'active'

  function updateSummary(rows) {
    const confirmed = rows.filter(row => row.status === 'confirmed')
    const completed = rows.filter(row => row.status === 'completed')
    const cancelled = rows.filter(row => row.status === 'cancelled')
    const noShows = rows.filter(row => row.status === 'no_show')
    const capacity = rows.reduce((sum, row) => sum + Number(row.party_size || 0), 0)
    summary.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><h3>${escapeHtml(context.profile.booking_label)}s</h3><p>${rows.length}</p></div>
        <div class="summary-card"><h3>${escapeHtml(context.profile.capacity_label)}</h3><p>${capacity}</p></div>
        <div class="summary-card"><h3>Confirmed</h3><p>${confirmed.length}</p></div>
        <div class="summary-card"><h3>Completed</h3><p>${completed.length}</p></div>
        <div class="summary-card"><h3>Cancelled</h3><p>${cancelled.length}</p></div>
        <div class="summary-card"><h3>No Shows</h3><p>${noShows.length}</p></div>
      </div>
    `
  }

  function renderRows(rows) {
    updateSummary(rows)
    if (!rows.length) {
      target.innerHTML = '<p>No reservations found.</p>'
      return
    }

    target.innerHTML = rows.map(row => `
      <article class="entity-card" data-reservation-id="${row.id}">
        <div>
          <h3>${escapeHtml(row.reservation_reference || 'No reference')}</h3>
          <p>${escapeHtml(row.customer_name || '')} · ${escapeHtml(row.phone || '')}</p>
          <p>${escapeHtml(row.reservation_date || '')} ${escapeHtml(String(row.reservation_time || '').slice(0, 5))}</p>
          <small>${escapeHtml(renderStatus(row.status))}${row.is_archived ? ' · Archived' : ''}</small>
        </div>
        ${canManage ? `
          <div class="session-actions">
            ${row.status === 'confirmed' ? `<button type="button" data-action="completed" data-id="${row.id}">Complete</button><button type="button" data-action="no_show" data-id="${row.id}">No show</button>` : ''}
            ${row.is_archived ? `<button type="button" data-action="restore" data-id="${row.id}">Restore</button>` : `<button type="button" data-action="archive" data-id="${row.id}">Archive</button>`}
          </div>
        ` : ''}
      </article>
    `).join('')
  }

  async function loadRows(reference = '') {
    let query = supabase.from('reservations').select('*')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })

    if (reference) {
      query = query.eq('reservation_reference', reference)
    } else {
      query = query.gte('reservation_date', startInput.value).lte('reservation_date', endInput.value)
      if (viewMode === 'active') query = query.eq('is_archived', false)
      if (viewMode === 'archived') query = query.eq('is_archived', true)
    }

    const { data, error } = await query
    if (error) {
      target.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`
      return
    }
    renderRows(data || [])
  }

  target.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]')
    if (!button || !canManage) return
    const id = Number(button.dataset.id)
    const action = button.dataset.action
    let mutation
    if (action === 'completed' || action === 'no_show') {
      mutation = supabase.from('reservations').update({ status: action }).eq('id', id)
    } else if (action === 'archive') {
      mutation = supabase.from('reservations').update({ is_archived: true }).eq('id', id)
    } else if (action === 'restore') {
      mutation = supabase.from('reservations').update({ is_archived: false }).eq('id', id)
    }
    if (!mutation) return
    const { error } = await mutation
    if (error) return window.alert(error.message)
    await loadRows()
  })

  document.getElementById('loadDateButton').addEventListener('click', () => loadRows())
  document.getElementById('refreshButton').addEventListener('click', () => loadRows())
  document.getElementById('searchButton').addEventListener('click', () => loadRows(document.getElementById('searchReference').value.trim()))
  document.getElementById('showActiveButton').addEventListener('click', () => { viewMode = 'active'; loadRows() })
  document.getElementById('showArchivedButton').addEventListener('click', () => { viewMode = 'archived'; loadRows() })
  document.getElementById('showAllButton').addEventListener('click', () => { viewMode = 'all'; loadRows() })

  await loadRows()
}

async function renderAnalytics(context) {
  if (!hasCapability('viewAnalytics')) {
    document.querySelector('#app').innerHTML = `<main><h1>Analytics</h1>${renderNav('analytics')}<p>This role does not have access to Reservations analytics.</p></main>`
    return
  }

  const today = new Date().toISOString().split('T')[0]
  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>${escapeHtml(context.profile.business_name)} Analytics</h1>
      ${renderNav('analytics')}
      <label>Start Date<input type="date" id="analyticsStartDate" value="${today}"></label>
      <label>End Date<input type="date" id="analyticsEndDate" value="${today}"></label>
      <button id="loadAnalyticsButton" type="button">Load Analytics</button>
      <div id="analyticsResults"></div>
    </main>
  `

  async function loadAnalytics() {
    const { data, error } = await supabase.from('reservations').select('*')
      .eq('business_id', businessId)
      .gte('reservation_date', document.getElementById('analyticsStartDate').value)
      .lte('reservation_date', document.getElementById('analyticsEndDate').value)
    const target = document.getElementById('analyticsResults')
    if (error) {
      target.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`
      return
    }
    const rows = data || []
    const count = status => rows.filter(row => row.status === status).length
    const capacity = rows.reduce((sum, row) => sum + Number(row.party_size || 0), 0)
    target.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><h3>Total ${escapeHtml(context.profile.booking_label)}s</h3><p>${rows.length}</p></div>
        <div class="summary-card"><h3>${escapeHtml(context.profile.capacity_label)}</h3><p>${capacity}</p></div>
        <div class="summary-card"><h3>Confirmed</h3><p>${count('confirmed')}</p></div>
        <div class="summary-card"><h3>Completed</h3><p>${count('completed')}</p></div>
        <div class="summary-card"><h3>Cancelled</h3><p>${count('cancelled')}</p></div>
        <div class="summary-card"><h3>No Shows</h3><p>${count('no_show')}</p></div>
      </div>
    `
  }

  document.getElementById('loadAnalyticsButton').addEventListener('click', loadAnalytics)
  await loadAnalytics()
}

async function renderSettings(context) {
  const canManage = hasCapability('manageSettings')
  const profile = context.profile
  const settings = context.settings
  const branding = context.branding

  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>${escapeHtml(profile.business_name)} Settings</h1>
      ${renderNav('settings')}
      ${canManage ? '' : '<p class="read-only-notice">Settings are read-only for this TerraPeak role.</p>'}

      <section id="businessSettingsSection" class="panel">
        <h2>Business profile</h2>
        <form id="businessProfileForm">
          <label>Business name<input id="businessName" value="${escapeHtml(profile.business_name || '')}" ${canManage ? '' : 'disabled'}></label>
          <label>Booking label<input id="bookingLabel" value="${escapeHtml(profile.booking_label || 'Reservation')}" ${canManage ? '' : 'disabled'}></label>
          <label>Customer label<input id="customerLabel" value="${escapeHtml(profile.customer_label || 'Customer')}" ${canManage ? '' : 'disabled'}></label>
          <label>Capacity label<input id="capacityLabel" value="${escapeHtml(profile.capacity_label || 'Guests')}" ${canManage ? '' : 'disabled'}></label>
          <label><input type="checkbox" id="usesCapacity" ${profile.uses_capacity ? 'checked' : ''} ${canManage ? '' : 'disabled'}> Allow group bookings</label>
          ${canManage ? '<button type="submit">Save Business Profile</button>' : ''}
        </form>
      </section>

      <section id="operationsSettingsSection" class="panel">
        <h2>Operational settings</h2>
        <form id="operationalSettingsForm">
          <label>Opening time<input type="time" id="openingTime" value="${escapeHtml(settings.opening_time || '09:00')}" ${canManage ? '' : 'disabled'}></label>
          <label>Closing time<input type="time" id="closingTime" value="${escapeHtml(settings.closing_time || '17:00')}" ${canManage ? '' : 'disabled'}></label>
          <label>Maximum guests per slot<input type="number" id="maxGuestsPerSlot" value="${Number(settings.max_guests_per_slot || 1)}" ${canManage ? '' : 'disabled'}></label>
          <label>Default duration<input type="number" id="defaultDurationMinutes" value="${Number(settings.default_duration_minutes || 60)}" ${canManage ? '' : 'disabled'}></label>
          ${canManage ? '<button type="submit">Save Operational Settings</button>' : ''}
        </form>
      </section>

      <section id="brandingSettingsSection" class="panel">
        <h2>Brand settings</h2>
        <form id="brandingForm">
          <label>Display name<input id="restaurantName" value="${escapeHtml(branding.restaurant_name || profile.business_name || '')}" ${canManage ? '' : 'disabled'}></label>
          <label>Primary color<input type="color" id="primaryColor" value="${escapeHtml(branding.primary_color || '#2f5d50')}" ${canManage ? '' : 'disabled'}></label>
          ${canManage ? '<button type="submit">Save Brand Settings</button>' : ''}
        </form>
      </section>

      <div id="brandingMessage"></div>
    </main>
  `

  if (!canManage) return
  const message = document.getElementById('brandingMessage')

  document.getElementById('businessProfileForm').addEventListener('submit', async event => {
    event.preventDefault()
    const payload = {
      business_name: document.getElementById('businessName').value.trim(),
      booking_label: document.getElementById('bookingLabel').value.trim(),
      customer_label: document.getElementById('customerLabel').value.trim(),
      capacity_label: document.getElementById('capacityLabel').value.trim(),
      uses_capacity: document.getElementById('usesCapacity').checked
    }
    const { error } = await supabase.from('business_profile').update(payload).eq('business_id', businessId)
    message.textContent = error ? error.message : 'Business profile saved.'
  })

  document.getElementById('operationalSettingsForm').addEventListener('submit', async event => {
    event.preventDefault()
    const payload = {
      opening_time: document.getElementById('openingTime').value,
      closing_time: document.getElementById('closingTime').value,
      max_guests_per_slot: Number(document.getElementById('maxGuestsPerSlot').value),
      default_duration_minutes: Number(document.getElementById('defaultDurationMinutes').value)
    }
    const { error } = await supabase.from('restaurant_settings').update(payload).eq('business_id', businessId)
    message.textContent = error ? error.message : 'Operational settings saved.'
  })

  document.getElementById('brandingForm').addEventListener('submit', async event => {
    event.preventDefault()
    const payload = {
      restaurant_name: document.getElementById('restaurantName').value.trim(),
      primary_color: document.getElementById('primaryColor').value
    }
    const { error } = await supabase.from('restaurant_branding').update(payload).eq('business_id', businessId)
    message.textContent = error ? error.message : 'Brand settings saved.'
  })
}

const context = await loadBusinessContext()

if (route === 'admin') await renderBookings(context)
if (route === 'admin/analytics') await renderAnalytics(context)
if (route === 'admin/settings') await renderSettings(context)
