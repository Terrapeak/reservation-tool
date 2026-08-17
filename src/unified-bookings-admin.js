import {
  listManagedBookings,
  setLegacyBookingArchived,
  updateManagedBookingStatus
} from './booking-management-store.js'

const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__
if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const businessId = Number(runtime.businessId)
const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')
const hasCapability = name => runtime.hasCapability?.(name) === true
const today = new Date().toISOString().slice(0, 10)

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function statusLabel(status) {
  return ({
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show'
  })[status] || status || 'Unknown'
}

function sourceLabel(row) {
  return row.source === 'bookings' ? 'Unified booking' : 'Legacy reservation'
}

async function renderBookings() {
  const canManage = hasCapability('manageBookings')
  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>Bookings</h1>
      <div class="analytics-filter-panel">
        <label>Start Date<input type="date" id="adminStartDateFilter" value="${today}"></label>
        <label>End Date<input type="date" id="adminEndDateFilter" value="${today}"></label>
        <button id="loadDateButton" type="button">Load Date Range</button>
      </div>
      <div>
        <input id="searchReference" type="text" placeholder="Search by reference number">
        <button id="searchButton" type="button">Search</button>
        <button id="refreshButton" type="button">Show All Bookings</button>
      </div>
      <div>
        <button id="showActiveButton" type="button">Active</button>
        <button id="showArchivedButton" type="button">Archived</button>
        <button id="showAllButton" type="button">All</button>
      </div>
      <div id="dashboardSummary"></div>
      <div id="adminReservations">Loading bookings...</div>
    </main>
  `

  const startInput = document.getElementById('adminStartDateFilter')
  const endInput = document.getElementById('adminEndDateFilter')
  const target = document.getElementById('adminReservations')
  const summary = document.getElementById('dashboardSummary')
  let viewMode = 'active'
  let currentRows = []

  function updateSummary(rows) {
    const count = status => rows.filter(row => row.status === status).length
    const capacity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    summary.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><h3>Bookings</h3><p>${rows.length}</p></div>
        <div class="summary-card"><h3>Guests / Places</h3><p>${capacity}</p></div>
        <div class="summary-card"><h3>Confirmed</h3><p>${count('confirmed')}</p></div>
        <div class="summary-card"><h3>Completed</h3><p>${count('completed')}</p></div>
        <div class="summary-card"><h3>Cancelled</h3><p>${count('cancelled')}</p></div>
        <div class="summary-card"><h3>No Shows</h3><p>${count('no_show')}</p></div>
      </div>
    `
  }

  function renderRows(rows) {
    currentRows = rows
    updateSummary(rows)
    if (!rows.length) {
      target.innerHTML = '<p>No bookings found.</p>'
      return
    }

    target.innerHTML = rows.map(row => `
      <article class="entity-card" data-booking-key="${escapeHtml(`${row.source}:${row.id}`)}">
        <div>
          <h3>${escapeHtml(row.reference || 'No reference')}</h3>
          <p>${escapeHtml(row.customerName)}${row.customerPhone ? ` · ${escapeHtml(row.customerPhone)}` : ''}</p>
          <p>${escapeHtml(row.bookingDate)} ${escapeHtml(row.bookingTime)}</p>
          <small>${escapeHtml(statusLabel(row.status))} · ${escapeHtml(sourceLabel(row))}${row.archived ? ' · Archived' : ''}</small>
        </div>
        ${canManage ? `
          <div class="session-actions">
            ${['pending', 'confirmed'].includes(row.status) ? `<button type="button" data-action="completed" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Complete</button><button type="button" data-action="no_show" data-key="${escapeHtml(`${row.source}:${row.id}`)}">No show</button><button type="button" data-action="cancelled" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Cancel</button>` : ''}
            ${row.archiveSupported ? (row.archived
              ? `<button type="button" data-action="restore" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Restore</button>`
              : `<button type="button" data-action="archive" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Archive</button>`) : ''}
          </div>
        ` : ''}
      </article>
    `).join('')
  }

  async function loadRows(reference = '') {
    target.innerHTML = '<p>Loading bookings...</p>'
    try {
      const rows = await listManagedBookings({
        businessId,
        startDate: startInput.value,
        endDate: endInput.value,
        reference,
        viewMode
      })
      renderRows(rows)
    } catch (error) {
      target.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`
    }
  }

  target.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]')
    if (!button || !canManage) return
    const booking = currentRows.find(row => `${row.source}:${row.id}` === button.dataset.key)
    if (!booking) return

    const action = button.dataset.action
    let result
    if (['completed', 'no_show', 'cancelled'].includes(action)) {
      result = await updateManagedBookingStatus(booking, action)
    } else if (action === 'archive') {
      result = await setLegacyBookingArchived(booking, true)
    } else if (action === 'restore') {
      result = await setLegacyBookingArchived(booking, false)
    }

    if (result?.error) return window.alert(result.error.message)
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

async function renderAnalytics() {
  if (!hasCapability('viewAnalytics')) {
    document.querySelector('#app').innerHTML = '<main><h1>Analytics</h1><p>This role does not have access to Reservations analytics.</p></main>'
    return
  }

  document.querySelector('#app').innerHTML = `
    <main class="legacy-reservations-management">
      <h1>Analytics</h1>
      <label>Start Date<input type="date" id="analyticsStartDate" value="${today}"></label>
      <label>End Date<input type="date" id="analyticsEndDate" value="${today}"></label>
      <button id="loadAnalyticsButton" type="button">Load Analytics</button>
      <div id="analyticsResults"></div>
    </main>
  `

  async function loadAnalytics() {
    const target = document.getElementById('analyticsResults')
    target.innerHTML = '<p>Loading analytics...</p>'
    try {
      const rows = await listManagedBookings({
        businessId,
        startDate: document.getElementById('analyticsStartDate').value,
        endDate: document.getElementById('analyticsEndDate').value,
        viewMode: 'all'
      })
      const count = status => rows.filter(row => row.status === status).length
      const capacity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
      const canonical = rows.filter(row => row.source === 'bookings').length
      const legacy = rows.filter(row => row.source === 'reservations').length
      target.innerHTML = `
        <div class="summary-grid">
          <div class="summary-card"><h3>Total Bookings</h3><p>${rows.length}</p></div>
          <div class="summary-card"><h3>Guests / Places</h3><p>${capacity}</p></div>
          <div class="summary-card"><h3>Confirmed</h3><p>${count('confirmed')}</p></div>
          <div class="summary-card"><h3>Completed</h3><p>${count('completed')}</p></div>
          <div class="summary-card"><h3>Cancelled</h3><p>${count('cancelled')}</p></div>
          <div class="summary-card"><h3>No Shows</h3><p>${count('no_show')}</p></div>
          <div class="summary-card"><h3>Unified Model</h3><p>${canonical}</p></div>
          <div class="summary-card"><h3>Legacy Records</h3><p>${legacy}</p></div>
        </div>
      `
    } catch (error) {
      target.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`
    }
  }

  document.getElementById('loadAnalyticsButton').addEventListener('click', loadAnalytics)
  await loadAnalytics()
}

if (route === 'admin') await renderBookings()
if (route === 'admin/analytics') await renderAnalytics()
