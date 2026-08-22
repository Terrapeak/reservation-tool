import { listManagedBookings, updateManagedBookingStatus } from './booking-management-store.js'

const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__
if (!runtime || runtime.source !== 'terrapeak-dashboard') throw new Error('Trusted TerraPeak Reservations runtime is required.')
const businessId = Number(runtime.businessId)
const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')
const hasCapability = name => runtime.hasCapability?.(name) === true
const today = new Date().toISOString().slice(0, 10)

function escapeHtml(value = '') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;') }
function statusLabel(status) { return ({ pending:'Awaiting confirmation', confirmed:'Confirmed', completed:'Completed', cancelled:'Cancelled', no_show:'No Show' })[status] || status || 'Unknown' }
function displayValue(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function detailRow(label, value) { return `<div class="booking-detail-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(displayValue(value))}</span></div>` }
function bookingDetails(row) {
  const custom = (row.customFields || []).map(field => detailRow(field.label, field.value)).join('')
  return `<section class="booking-detail-panel" data-detail-key="${escapeHtml(`${row.source}:${row.id}`)}" hidden>
    <div class="booking-detail-grid">
      ${detailRow('Reference', row.reference)}${detailRow('Service', row.serviceName)}${detailRow('Date', row.bookingDate)}${detailRow('Time', row.bookingTime)}${detailRow('Status', statusLabel(row.status))}
      ${detailRow('Customer', row.customerName)}${detailRow('Phone', row.customerPhone)}${detailRow('Email', row.customerEmail)}${detailRow('Notes', row.notes)}${custom}
    </div>
  </section>`
}

async function renderBookings() {
  const canManage = hasCapability('manageBookings')
  document.querySelector('#app').innerHTML = `<main class="reservations-management">
    <header class="management-page-heading"><div><h1>Bookings</h1><p>Search, review and update customer bookings.</p></div></header>
    <div class="analytics-filter-panel booking-filter-panel" aria-label="Booking filters"><div class="filter-date-grid"><label>Start date<input type="date" id="adminStartDateFilter" value="${today}"></label><label>End date<input type="date" id="adminEndDateFilter" value="${today}"></label></div><button id="loadDateButton" type="button">Apply dates</button></div>
    <div class="booking-search-toolbar" role="search"><label class="sr-only" for="searchReference">Booking reference</label><input id="searchReference" type="search" placeholder="Search by booking reference" autocomplete="off"><button id="searchButton" type="button">Search</button><button id="refreshButton" type="button">Clear search</button></div>
    <div class="booking-view-tabs" role="group" aria-label="Booking status view"><button id="showActiveButton" class="active" type="button" aria-pressed="true">Active</button><button id="showArchivedButton" type="button" aria-pressed="false">Past & cancelled</button><button id="showAllButton" type="button" aria-pressed="false">All</button></div>
    <div id="dashboardSummary"></div><div id="adminReservations" aria-live="polite">Loading bookings...</div>
  </main>`

  const startInput=document.getElementById('adminStartDateFilter'), endInput=document.getElementById('adminEndDateFilter'), target=document.getElementById('adminReservations'), summary=document.getElementById('dashboardSummary')
  let viewMode='active', currentRows=[]
  function updateSummary(rows) {
    const count=status=>rows.filter(row=>row.status===status).length
    summary.innerHTML=`<div class="summary-grid"><div class="summary-card"><h3>Bookings</h3><p>${rows.length}</p></div><div class="summary-card"><h3>Awaiting confirmation</h3><p>${count('pending')}</p></div><div class="summary-card"><h3>Confirmed</h3><p>${count('confirmed')}</p></div><div class="summary-card"><h3>Completed</h3><p>${count('completed')}</p></div><div class="summary-card"><h3>Cancelled</h3><p>${count('cancelled')}</p></div><div class="summary-card"><h3>No Shows</h3><p>${count('no_show')}</p></div></div>`
  }
  function renderRows(rows) {
    currentRows=rows; updateSummary(rows)
    if(!rows.length){target.innerHTML='<div class="management-empty-state"><h2>No bookings found</h2><p>Try another date range, status view or booking reference.</p></div>';return}
    target.innerHTML=rows.map(row=>`<article class="entity-card booking-card-admin" data-booking-key="${escapeHtml(`${row.source}:${row.id}`)}">
      <div class="booking-card-summary" role="button" tabindex="0" aria-expanded="false"><h3>${escapeHtml(row.reference||'No reference')}</h3><p>${escapeHtml(row.serviceName||'Booking')}</p><p>${escapeHtml(row.customerName)}${row.customerPhone?` · ${escapeHtml(row.customerPhone)}`:''}</p><p>${escapeHtml(row.bookingDate)} ${escapeHtml(row.bookingTime)}</p><span class="booking-status booking-status-${escapeHtml(row.status)}">${escapeHtml(statusLabel(row.status))}</span><p class="booking-detail-hint">View details</p></div>
      ${canManage?`<div class="session-actions">${row.status==='pending'?`<button type="button" data-action="confirmed" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Confirm appointment</button>`:''}${['pending','confirmed'].includes(row.status)?`<button type="button" data-action="completed" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Complete</button><button type="button" data-action="no_show" data-key="${escapeHtml(`${row.source}:${row.id}`)}">No show</button><button type="button" data-action="cancelled" data-key="${escapeHtml(`${row.source}:${row.id}`)}">Cancel</button>`:''}</div>`:''}
      ${bookingDetails(row)}</article>`).join('')
  }
  async function loadRows(reference='') {
    target.innerHTML='<p>Loading bookings...</p>'
    try { renderRows(await listManagedBookings({businessId,startDate:startInput.value,endDate:endInput.value,reference,viewMode})) }
    catch(error){target.innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`}
  }
  function toggleDetails(summaryEl) {
    const card=summaryEl.closest('[data-booking-key]'), panel=card?.querySelector('.booking-detail-panel'); if(!panel)return
    const opening=panel.hidden; panel.hidden=!opening; summaryEl.setAttribute('aria-expanded',String(opening)); const hint=summaryEl.querySelector('.booking-detail-hint'); if(hint)hint.textContent=opening?'Hide details':'View details'
  }
  target.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-action]')
    if(button){
      if(!canManage)return
      const booking=currentRows.find(row=>`${row.source}:${row.id}`===button.dataset.key); if(!booking)return
      const action=button.dataset.action; if(!['confirmed','completed','no_show','cancelled'].includes(action))return
      const result=await updateManagedBookingStatus(booking,action); if(result?.error)return window.alert(result.error.message); await loadRows(); return
    }
    const summaryEl=event.target.closest('.booking-card-summary'); if(summaryEl)toggleDetails(summaryEl)
  })
  target.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const summaryEl=event.target.closest('.booking-card-summary');if(!summaryEl)return;event.preventDefault();toggleDetails(summaryEl)})
  document.getElementById('loadDateButton').addEventListener('click',()=>loadRows())
  document.getElementById('refreshButton').addEventListener('click',()=>{document.getElementById('searchReference').value='';loadRows()})
  document.getElementById('searchButton').addEventListener('click',()=>loadRows(document.getElementById('searchReference').value.trim()))
  document.getElementById('searchReference').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();loadRows(event.currentTarget.value.trim())})
  const viewButtons=['showActiveButton','showArchivedButton','showAllButton']
  function selectView(buttonId,mode){viewMode=mode;viewButtons.forEach(id=>{const button=document.getElementById(id),selected=id===buttonId;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});loadRows()}
  document.getElementById('showActiveButton').addEventListener('click',()=>selectView('showActiveButton','active'))
  document.getElementById('showArchivedButton').addEventListener('click',()=>selectView('showArchivedButton','archived'))
  document.getElementById('showAllButton').addEventListener('click',()=>selectView('showAllButton','all'))
  await loadRows()
}

async function renderAnalytics() {
  if(!hasCapability('viewAnalytics')){document.querySelector('#app').innerHTML='<main><h1>Analytics</h1><p>This role does not have access to Reservations analytics.</p></main>';return}
  document.querySelector('#app').innerHTML=`<main class="reservations-management"><header class="management-page-heading"><div><h1>Analytics</h1><p>Review booking volume and attendance for any date range.</p></div></header><div class="analytics-filter-panel booking-filter-panel"><div class="filter-date-grid"><label>Start date<input type="date" id="analyticsStartDate" value="${today}"></label><label>End date<input type="date" id="analyticsEndDate" value="${today}"></label></div><button id="loadAnalyticsButton" type="button">Apply dates</button></div><div id="analyticsResults" aria-live="polite"></div></main>`
  async function loadAnalytics(){const target=document.getElementById('analyticsResults');target.innerHTML='<p>Loading analytics...</p>';try{const rows=await listManagedBookings({businessId,startDate:document.getElementById('analyticsStartDate').value,endDate:document.getElementById('analyticsEndDate').value,viewMode:'all'}),count=status=>rows.filter(row=>row.status===status).length;target.innerHTML=`<div class="summary-grid"><div class="summary-card"><h3>Total Bookings</h3><p>${rows.length}</p></div><div class="summary-card"><h3>Awaiting confirmation</h3><p>${count('pending')}</p></div><div class="summary-card"><h3>Confirmed</h3><p>${count('confirmed')}</p></div><div class="summary-card"><h3>Completed</h3><p>${count('completed')}</p></div><div class="summary-card"><h3>Cancelled</h3><p>${count('cancelled')}</p></div><div class="summary-card"><h3>No Shows</h3><p>${count('no_show')}</p></div></div>`}catch(error){target.innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`}}
  document.getElementById('loadAnalyticsButton').addEventListener('click',loadAnalytics);await loadAnalytics()
}

if(route==='admin')await renderBookings()
if(route==='admin/analytics')await renderAnalytics()