import './style.css'
import { supabase } from './supabaseclient.js'

const currentPage = window.location.pathname

const pathParts =
  window.location.pathname
    .split('/')
    .filter(Boolean)

let currentBusinessId = 1

let currentBusinessSlug =
  pathParts[0] || 'dim-sum-dragon'

let pageRoute = '/'

  if (pathParts.length === 0) {
    currentBusinessSlug = 'dim-sum-dragon'
    pageRoute = '/'
}

  if (pathParts.length === 1) {
    currentBusinessSlug = pathParts[0]
    pageRoute = '/'
}

  if (pathParts.length > 1) {
    currentBusinessSlug = pathParts[0]
    pageRoute = '/' + pathParts.slice(1).join('/')
}

console.log('PATH PARTS:', pathParts)
console.log('BUSINESS SLUG:', currentBusinessSlug)
console.log('PAGE ROUTE:', pageRoute)

async function loadCurrentBusiness() {
  console.log('CURRENT BUSINESS SLUG:', currentBusinessSlug)

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('business_slug', currentBusinessSlug)
    .single()

  if (error) {
    console.error('Could not load business:', error)

    return {
      id: 1,
      business_name: 'Dim Sum Dragon',
      business_slug: 'dim-sum-dragon',
      business_type: 'restaurant'
    }
  }

  currentBusinessId = data.id
  return data
}

function isAdminLoggedIn() {
  const loginExpiry = localStorage.getItem('adminLoginExpiry')

  if (!loginExpiry) {
    return false
  }

  return Date.now() < Number(loginExpiry)
}

function saveAdminLogin() {
  const eightHours = 8 * 60 * 60 * 1000
  const expiryTime = Date.now() + eightHours

  localStorage.setItem('adminLoginExpiry', expiryTime)
}

function requireAdminPassword() {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD

  if (isAdminLoggedIn()) {
    return true
  }

  const enteredPassword = prompt('Enter admin password:')

  if (enteredPassword === adminPassword) {
    saveAdminLogin()
    return true
  }

  return false
}

async function loadBranding() {
  const { data, error } = await supabase
    .from('restaurant_branding')
    .select('*')
    .eq('business_id', currentBusinessId)
    .single()

  if (error) {
    console.error('Could not load branding:', error)
    return {
      restaurant_name: 'Dim Sum Dragon',
      logo_url: '',
      primary_color: '#b32626',
      background_start: '#fff8ef',
      background_end: '#f1dfcf'
    }
  }

  document.documentElement.style.setProperty('--primary-color', data.primary_color)
  document.documentElement.style.setProperty('--primary-dark-color', data.primary_color)
  document.documentElement.style.setProperty('--background-start', data.background_start)
  document.documentElement.style.setProperty('--background-end', data.background_end)

  return data
}

async function loadRestaurantSettings() {
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('*')
    .eq('business_id', currentBusinessId)
    .single()

  if (error) {
    console.error('Could not load restaurant settings:', error)

    return {
      opening_time: '11:00',
      closing_time: '22:00',
      max_guests_per_slot: 20,
      default_duration_minutes: 90
    }
  }

  return data
}

async function loadBusinessProfile() {
  const { data, error } = await supabase
    .from('business_profile')
    .select('*')
    .eq('business_id', currentBusinessId)
    .single()

  if (error) {
    console.error('Could not load business profile:', error)

    return {
      business_name: 'Dim Sum Dragon',
      business_type: 'restaurant',
      booking_label: 'Reservation',
      customer_label: 'Customer',
      capacity_label: 'Guests'
    }
  }

  return data
}

async function loadCustomFields() {
  const { data, error } = await supabase
    .from('booking_custom_fields')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Could not load custom fields:', error)
    return []
  }

  return data
}

const currentBusiness = await loadCurrentBusiness()

if (pageRoute === '/') {
  const profile = await loadBusinessProfile()
  const branding = await loadBranding()
  const customFields = await loadCustomFields()

  document.querySelector('#app').innerHTML = `
  ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
  <h1>${profile.business_name} ${profile.booking_label}s</h1>

  <form id="reservationForm">
    <input type="text" 
    id="name" 
    placeholder="${profile.customer_label} 
    Name" required />
    <br /><br />

    <input type="text" 
    id="phone" 
    placeholder="Phone Number" 
    required />
    <br /><br />

    <input type="date" 
    id="date" 
    required />
    <br /><br />

    <input type="time" 
    id="time" 
    required />
    <br /><br />

    ${
  profile.uses_capacity
    ? `
      <input
        type="number"
        id="guests"
        placeholder="Number of ${profile.capacity_label}"
        required
      />
      <br /><br />
    `
    : ''
}
    
    ${customFields.map((field) => {
  if (field.field_type === 'textarea') {
    return `
      <textarea
        id="custom-${field.id}"
        placeholder="${field.field_label}"
        ${field.is_required ? 'required' : ''}
      ></textarea>
      <br /><br />
    `
  }

  if (field.field_type === 'checkbox') {
    return `
      <label>
        <input
          type="checkbox"
          id="custom-${field.id}"
        />
        ${field.field_label}
      </label>
      <br /><br />
    `
  }

  if (field.field_type === 'dropdown') {
    const options = (field.field_options || '')
      .split('\n')
      .filter(option => option.trim() !== '')

    return `
      <label>${field.field_label}</label>
      <select
        id="custom-${field.id}"
        ${field.is_required ? 'required' : ''}
      >
        <option value="">Select an option</option>
        ${options.map(option => `
          <option value="${option}">
            ${option}
          </option>
        `).join('')}
      </select>
      <br /><br />
    `
  }

  return `
    <input
      type="${field.field_type}"
      id="custom-${field.id}"
      placeholder="${field.field_label}"
      ${field.is_required ? 'required' : ''}
    />
    <br /><br />
  `
}).join('')}

    <textarea id="request" placeholder="Special Requests"></textarea>
    <br /><br />

    <button type="submit">Create ${profile.booking_label}</button>
  </form>

  <hr>

  <div id="message"></div>
<hr>

<h2>Cancel ${profile.booking_label}</h2>

<form id="cancelForm">
  <input
    type="text"
    id="cancelReference"
    placeholder="${profile.booking_label} Reference"
    required
  />

  <br /><br />

  <button type="submit">
    Cancel ${profile.booking_label}
  </button>
</form>

<div id="cancelMessage"></div>

`

const form = document.getElementById('reservationForm')
const submitButton = form.querySelector('button[type="submit"]')
const cancelForm = document.getElementById('cancelForm')
const cancelButton = cancelForm.querySelector('button[type="submit"]')

async function checkAvailability(
  reservation_date,
  reservation_time,
  requestedGuests
) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('reservation_date', reservation_date)
    .eq('reservation_time', reservation_time)
    .eq('status', 'confirmed')

  if (error) {
    console.error(error)
    return false
  }

  const currentGuests = data.reduce(
    (total, reservation) =>
      total + reservation.party_size,
    0
  )

  const settings = await loadRestaurantSettings()
  const maxGuestsPerSlot = settings.max_guests_per_slot

  return (
    currentGuests + requestedGuests
    <=
    maxGuestsPerSlot
  )
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function normalizeTime(time) {
  if (time.length === 5) {
    return `${time}:00`
  }

  return time
}

async function findAvailableSlots(reservation_date, requested_time, party_size) {
  const settings = await loadRestaurantSettings()

  const closingTime = timeToMinutes(settings.closing_time)
  const requestedMinutes = timeToMinutes(requested_time)

  const availableSlots = []

  for (
    let minutes = requestedMinutes + 30;
    minutes < closingTime;
    minutes += 30
  ) {
    const slot = minutesToTime(minutes)

    const available = await checkAvailability(
      reservation_date,
      slot,
      party_size
    )

    if (available) {
      availableSlots.push(slot)
    }

    if (availableSlots.length === 3) {
      break
    }
  }

  return availableSlots
}

async function generateReservationReference(reservation_date) {
  const dateCode = reservation_date.replaceAll('-', '')

  const { data, error } = await supabase
    .from('reservations')
    .select('id')
    .eq('business_id', currentBusinessId)
    .eq('reservation_date', reservation_date)

  if (error) {
    console.error(error)
    return `DSD-${dateCode}-001`
  }

  const nextNumber = data.length + 1
  const paddedNumber = String(nextNumber).padStart(3, '0')

  return `DSD-${dateCode}-${paddedNumber}`
}

async function isWithinOpeningHours(reservation_time) {
  const settings = await loadRestaurantSettings()

  const openingTime = timeToMinutes(settings.opening_time)
  const closingTime = timeToMinutes(settings.closing_time)
  const requestedTime = timeToMinutes(reservation_time)

  return requestedTime >= openingTime && requestedTime < closingTime
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
submitButton.disabled = true
submitButton.textContent = 'Creating Reservation...'

  const customer_name = document.getElementById('name').value
  const phone = document.getElementById('phone').value
  const reservation_date = document.getElementById('date').value
  const reservation_time = document.getElementById('time').value
  const party_size =
    profile.uses_capacity
      ? parseInt(document.getElementById('guests').value)
      : 1
  const special_request = document.getElementById('request').value
  const reservation_reference =
  await generateReservationReference(reservation_date)

if (!(await isWithinOpeningHours(reservation_time))) {
  const message = document.getElementById('message')

  message.innerHTML = `
    <p style="color:red">
      Sorry, reservations are only available from 11:00 AM to 10:00 PM.
    </p>
  `

  submitButton.disabled = false
  submitButton.textContent = 'Create Reservation'

  return
}

const available =
  await checkAvailability(
    reservation_date,
    reservation_time,
    party_size
  )

if (!available) {
  const alternativeSlots = await findAvailableSlots(
    reservation_date,
    reservation_time,
    party_size
  )

  const message = document.getElementById('message')

  if (alternativeSlots.length === 0) {
    message.innerHTML = `
      <p style="color:red">
        Sorry, this time slot is fully booked and there are no later available slots today.
      </p>
    `
  } else {
    message.innerHTML = `
      <p style="color:red">
        Sorry, this time slot is fully booked.
      </p>

      <p>
        Available later times:
        <strong>${alternativeSlots.join(', ')}</strong>
      </p>
    `
  }

  submitButton.disabled = false
  submitButton.textContent = 'Create Reservation'

  return
}

const custom_data = {}

customFields.forEach((field) => {
  const customInput = document.getElementById(`custom-${field.id}`)

custom_data[field.field_label] =
  field.field_type === 'checkbox'
    ? customInput.checked
      ? 'Yes'
      : 'No'
    : customInput.value
})

  const { error } = await supabase
    .from('reservations')
    .insert([
      {
        business_id: currentBusinessId,
        customer_name,
        phone,
        reservation_date,
        reservation_time,
        party_size,
        special_request,
        reservation_reference,
        custom_data
      }
    ])

  const message = document.getElementById('message')

  if (error) {
    console.error(error)
    message.innerHTML = `<p style="color:red">Reservation failed.</p>`

    submitButton.disabled = false
    submitButton.textContent = 'Create Reservation'

    return
  }

  message.innerHTML = `
  <p style="color:green">Reservation created successfully!</p>
  <p>Your reservation reference is: <strong>${reservation_reference}</strong></p>
`

  form.reset()
  submitButton.disabled = false
submitButton.textContent = 'Create Reservation'
})

cancelForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  cancelButton.disabled = true
  cancelButton.textContent = 'Cancelling...'

  const reservation_reference = document
    .getElementById('cancelReference')
    .value
    .trim()

  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('business_id', currentBusinessId)
    .eq('reservation_reference', reservation_reference)
    .eq('status', 'confirmed')
    .select()

  const cancelMessage = document.getElementById('cancelMessage')

  if (error) {
    console.error(error)
    cancelMessage.innerHTML = `
      <p style="color:red">
        Could not cancel reservation. Please try again.
      </p>
    `

    cancelButton.disabled = false
    cancelButton.textContent = 'Cancel Reservation'

    return
  }

  if (data.length === 0) {
    cancelMessage.innerHTML = `
      <p style="color:red">
        No active ${profile.booking_label.toLowerCase()} found with that reference number.
      </p>
    `

    cancelButton.disabled = false
    cancelButton.textContent = 'Cancel Reservation'

    return
  }

  cancelMessage.innerHTML = `
  <p style="color:green">
    ${profile.booking_label} ${reservation_reference} has been cancelled.
  </p>

  `

  cancelForm.reset()

  cancelButton.disabled = false
  cancelButton.textContent = 'Cancel Reservation'
})

}

if (pageRoute === '/admin') {
  const branding = await loadBranding()
  const profile = await loadBusinessProfile()

  if (!requireAdminPassword()) {
  document.querySelector('#app').innerHTML = `
    <h1>Access Denied</h1>
    <p>You are not authorized to view this page.</p>
  `
} else {
  document.querySelector('#app').innerHTML = `
  ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
  <h1>${profile.business_name} Admin Dashboard</h1>

  <div class="admin-nav">
  <a href="/${currentBusinessSlug}/admin">Dashboard</a>
  <a href="/${currentBusinessSlug}/admin/analytics">Analytics</a>
  <a href="/${currentBusinessSlug}/admin/settings">Settings</a>
</div>

    <input 
  type="text" 
  id="searchReference" 
  placeholder="Search by reference number"
/>

<<button id="searchButton">Search</button>

<button id="refreshButton">
  Show All ${profile.booking_label}s
</button>
<br /><br />

<label>Select Date</label>
<input type="date" id="adminDateFilter" />
<button id="loadDateButton">Load Date</button>
<br /><br />

<label>View</label>
<button id="showActiveButton">Active</button>
<button id="showArchivedButton">Archived</button>
<button id="showAllButton">All</button>

<hr>

<div id="dashboardSummary"></div>

<hr>

<div id="adminReservations">Loading reservations...</div>
  `

const refreshButton = document.getElementById('refreshButton')
const searchButton = document.getElementById('searchButton')
const searchReference = document.getElementById('searchReference')
const adminReservations = document.getElementById('adminReservations')
const dashboardSummary = document.getElementById('dashboardSummary')
const adminDateFilter = document.getElementById('adminDateFilter')
const loadDateButton = document.getElementById('loadDateButton')
const showActiveButton = document.getElementById('showActiveButton')
const showArchivedButton = document.getElementById('showArchivedButton')
const showAllButton = document.getElementById('showAllButton')

let selectedAdminDate = new Date().toISOString().split('T')[0]
adminDateFilter.value = selectedAdminDate

let adminViewMode = 'active'

async function markReservationCompleted(reservationId) {
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'completed' })
    .eq('id', reservationId)

  if (error) {
    console.error(error)
    alert('Could not mark reservation as completed.')
    return
  }

  loadAdminReservations()
}

function updateDashboardSummary(reservations) {
  const selectedReservations = reservations.filter(
    reservation => reservation.reservation_date === selectedAdminDate
  )

  const confirmed = selectedReservations.filter(
    reservation => reservation.status === 'confirmed'
  )

  const cancelled = selectedReservations.filter(
    reservation => reservation.status === 'cancelled'
  )

  const completed = selectedReservations.filter(
    reservation => reservation.status === 'completed'
  )

  const noShows = selectedReservations.filter(
    reservation => reservation.status === 'no_show'
  )

  const totalGuests = confirmed.reduce(
    (total, reservation) => total + reservation.party_size,
    0
  )

  dashboardSummary.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <h3>${profile.booking_label}s</h3>
        <p>${selectedReservations.length}</p>
      </div>

      <div class="summary-card">
        <h3>${profile.capacity_label} Today</h3>
        <p>${totalCapacityUnits}</p>
      </div>

      <div class="summary-card">
        <h3>Confirmed</h3>
        <p>${confirmed.length}</p>
      </div>

      <div class="summary-card">
        <h3>Completed</h3>
        <p>${completed.length}</p>
      </div>

      <div class="summary-card">
        <h3>Cancelled</h3>
        <p>${cancelled.length}</p>
      </div>

      <div class="summary-card">
        <h3>No Shows</h3>
        <p>${noShows.length}</p>
      </div>
    </div>
  `
}

async function markReservationNoShow(reservationId) {
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'no_show' })
    .eq('id', reservationId)

  if (error) {
    console.error(error)
    alert('Could not mark reservation as no show.')
    return
  }

  loadAdminReservations()
}

async function archiveReservation(reservationId) {
  console.log('ARCHIVING ID:', reservationId)

  const { error } = await supabase
    .from('reservations')
    .update({ is_archived: true })
    .eq('id', reservationId)

  if (error) {
    console.error(error)
    alert('Could not archive reservation.')
    return
  }

    loadAdminReservations()
}
  async function restoreReservation(reservationId) {
  const { error } = await supabase
    .from('reservations')
    .update({ is_archived: false })
    .eq('id', reservationId)

  if (error) {
    console.error(error)
    alert('Could not restore reservation.')
    return
  }

  loadAdminReservations()
}

async function deleteReservation(reservationId) {
  const deletePassword = import.meta.env.VITE_DELETE_PASSWORD
  const enteredPassword = prompt('Enter manager delete password:')

  if (enteredPassword !== deletePassword) {
    alert('Delete cancelled. Incorrect password.')
    return
  }

  const confirmDelete = confirm(
    'This will permanently delete the reservation. Are you sure?'
  )

  if (!confirmDelete) {
    return
  }

  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', reservationId)

  if (error) {
    console.error(error)
    alert('Could not delete reservation.')
    return
  }

  loadAdminReservations()
}

async function loadAdminReservations() {
  let query = supabase
  .from('reservations')
  .select('*')
  .eq('business_id', currentBusinessId)
  .eq('reservation_date', selectedAdminDate)
  .order('reservation_time', { ascending: true })

if (adminViewMode === 'active') {
  query = query.eq('is_archived', false)
}

if (adminViewMode === 'archived') {
  query = query.eq('is_archived', true)
}

const { data, error } = await query

  if (error) {
    console.error(error)
    adminReservations.innerHTML = `
      <p style="color:red">Could not load reservations.</p>
    `
    return
  }

  if (data.length === 0) {
    adminReservations.innerHTML = '<p>No reservations found.</p>'
    updateDashboardSummary([])
    return
  }

  updateDashboardSummary(data)

  adminReservations.innerHTML = data.map((reservation) => `
    <div style="border:1px solid #ccc; padding:12px; margin-bottom:10px; border-radius:8px;">
      <strong>${reservation.reservation_reference || 'No reference'}</strong><br>
      Name: ${reservation.customer_name}<br>
      Phone: ${reservation.phone}<br>
      Date: ${reservation.reservation_date}<br>
      Time: ${reservation.reservation_time}<br>
      Guests: ${reservation.party_size}<br>
      Status:
      ${
        reservation.status === 'confirmed'
          ? '<span style="color:green;font-weight:bold;">Confirmed</span>'
          : reservation.status === 'cancelled'
          ? '<span style="color:red;font-weight:bold;">Cancelled</span>'
          : reservation.status === 'completed'
          ? '<span style="color:blue;font-weight:bold;">Completed</span>'
          : reservation.status === 'no_show'
          ? '<span style="color:orange;font-weight:bold;">No Show</span>'
          : reservation.status
      }

      ${
           reservation.is_archived
            ? '<span style="color:gray;font-weight:bold;">Archived</span><br>'
            : ''
      }
      <br>
      Request: ${reservation.special_request || 'None'}<br>

${renderCustomData(reservation.custom_data)}

<br><br>

      ${
        !reservation.is_archived
          ? `
            ${
              reservation.status === 'confirmed'
                ? `
                  <button class="complete-button" data-id="${reservation.id}">
                    Mark Arrived / Completed
                  </button>

                  <button class="noshow-button" data-id="${reservation.id}">
                    Mark No Show
                  </button>
                `
                : ''
            }

            <button class="archive-button" data-id="${reservation.id}">
              Archive
            </button>
          `
          : ''
      }

      ${
  reservation.is_archived
    ? `
      <button class="restore-button" data-id="${reservation.id}">
        Restore
      </button>
    `
    : ''
}

<button class="delete-button" data-id="${reservation.id}">
  Manager Delete
</button>

    </div>
  `).join('')
}

async function searchReservationByReference() {
  const reference = searchReference.value.trim()

  if (!reference) {
    adminReservations.innerHTML = `
      <p style="color:red">Please enter a reservation reference.</p>
    `
    return
  }

  const { data, error } = await supabase
  .from('reservations')
  .select('*')
  .eq('business_id', currentBusinessId)
  .eq('reservation_reference', reference)

  if (error) {
    console.error(error)
    adminReservations.innerHTML = `
      <p style="color:red">Search failed.</p>
    `
    return
  }

  if (data.length === 0) {
    adminReservations.innerHTML = `
      <p>No reservation found for reference: <strong>${reference}</strong></p>
    `
    return
  }

  adminReservations.innerHTML = data.map((reservation) => `
    <div style="border:1px solid #ccc; padding:12px; margin-bottom:10px; border-radius:8px;">
      <strong>${reservation.reservation_reference || 'No reference'}</strong><br>
      Name: ${reservation.customer_name}<br>
      Phone: ${reservation.phone}<br>
      Date: ${reservation.reservation_date}<br>
      Time: ${reservation.reservation_time}<br>
      Guests: ${reservation.party_size}<br>
      Status:
${
  reservation.status === 'confirmed'
    ? '<span style="color:green;font-weight:bold;">Confirmed</span>'
    : reservation.status === 'cancelled'
    ? '<span style="color:red;font-weight:bold;">Cancelled</span>'
    : reservation.status === 'completed'
    ? '<span style="color:blue;font-weight:bold;">Completed</span>'
    : reservation.status === 'no_show'
    ? '<span style="color:orange;font-weight:bold;">No Show</span>'
    : reservation.status
}
<br>

${
  reservation.is_archived
    ? '<span style="color:gray;font-weight:bold;">Archived</span><br>'
    : ''
}
      <br>
      Request: ${reservation.special_request || 'None'}<br>

${renderCustomData(reservation.custom_data)}

<br><br>

      ${
        !reservation.is_archived
          ? `
            ${
              reservation.status === 'confirmed'
                ? `
                  <button class="complete-button" data-id="${reservation.id}">
                    Mark Arrived / Completed
                  </button>

                  <button class="noshow-button" data-id="${reservation.id}">
                    Mark No Show
                  </button>
                `
                : ''
            }

            <button class="archive-button" data-id="${reservation.id}">
              Archive
            </button>
          `
          : ''
      }
    </div>
  `).join('')
}

adminReservations.addEventListener('click', async (e) => {

  if (e.target.classList.contains('complete-button')) {
    const reservationId = e.target.dataset.id
    await markReservationCompleted(reservationId)
  }

  if (e.target.classList.contains('noshow-button')) {
    const reservationId = e.target.dataset.id
    await markReservationNoShow(reservationId)
  }

if (e.target.classList.contains('archive-button')) {
  const reservationId = e.target.dataset.id
  await archiveReservation(reservationId)
}

if (e.target.classList.contains('restore-button')) {
  const reservationId = e.target.dataset.id
  await restoreReservation(reservationId)
}

if (e.target.classList.contains('delete-button')) {
  const reservationId = e.target.dataset.id
  await deleteReservation(reservationId)
}

})

  refreshButton.addEventListener('click', loadAdminReservations)
  searchButton.addEventListener('click', searchReservationByReference)

  loadDateButton.addEventListener('click', () => {
    selectedAdminDate = adminDateFilter.value
    loadAdminReservations()
})

showActiveButton.addEventListener('click', () => {
  adminViewMode = 'active'
  loadAdminReservations()
})

showArchivedButton.addEventListener('click', () => {
  adminViewMode = 'archived'
  loadAdminReservations()
})

showAllButton.addEventListener('click', () => {
  adminViewMode = 'all'
  loadAdminReservations()
})

function renderCustomData(customData) {
  if (!customData) {
    return ''
  }

  return Object.entries(customData)
    .map(([key, value]) => key + ': ' + value)
    .join('<br>')
}

  loadAdminReservations()
}
}


if (pageRoute === '/admin/settings') {
  const branding = await loadBranding()
  const profile = await loadBusinessProfile()

  const { data: settings } = await supabase
    .from('restaurant_settings')
    .select('*')
    .eq('business_id', currentBusinessId)
    .single()
if (!requireAdminPassword()) {
    document.querySelector('#app').innerHTML = `
      <h1>Access Denied</h1>
      <p>You are not authorized to view this page.</p>
    `
  } else {
    document.querySelector('#app').innerHTML = `
      ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
      <h1>${branding.restaurant_name} Settings</h1>

      <div class="admin-nav">
        <a href="/${currentBusinessSlug}/admin">Dashboard</a>
        <a href="/${currentBusinessSlug}/admin/analytics">Analytics</a>
        <a href="/${currentBusinessSlug}/admin/settings">Settings</a>
      </div>
      
      <div class="settings-tabs">
        <button id="businessTabButton" type="button">Business</button>
        <button id="operationsTabButton" type="button">Operations</button>
        <button id="brandingTabButton" type="button">Branding</button>
      </div>
      
      <div id="businessSettingsSection">
      <form id="businessProfileForm">
        <h2>Business Profile</h2>

        <input type="text" id="businessName" value="${profile.business_name}" placeholder="Business Name" />
        <br /><br />

        <label>Business Type</label>
        <input type="text" id="businessType" value="${profile.business_type}" placeholder="restaurant, salon, physiotherapy" />
        <br /><br />

        <label>Industry Template</label>

        <select id="industryTemplate">
          <option value="restaurant"
            ${profile.industry_template === 'restaurant' ? 'selected' : ''}>
            Restaurant
          </option>

          <option value="salon"
            ${profile.industry_template === 'salon' ? 'selected' : ''}>
            Salon
          </option>

          <option value="physiotherapy"
            ${profile.industry_template === 'physiotherapy' ? 'selected' : ''}>
            Physiotherapy
          </option>

          <option value="general"
            ${profile.industry_template === 'general' ? 'selected' : ''}>
            General Appointment
          </option>
        </select>

        <br /><br />

        <label>Booking Label</label>
        <input type="text" id="bookingLabel" value="${profile.booking_label}" placeholder="Reservation, Booking, Appointment" />
        <br /><br />

        <label>Customer Label</label>
        <input type="text" id="customerLabel" value="${profile.customer_label}" placeholder="Customer, Client, Patient" />
        <br /><br />

        <label>Capacity Label</label>
        <input type="text" id="capacityLabel" value="${profile.capacity_label}" placeholder="Guests, Clients, Patients" />
        <br /><br />

        <label>
        <input type="checkbox"
         id="usesCapacity"
         ${profile.uses_capacity ? 'checked' : ''}
        />
        Allow Group Bookings
        </label>

        <br /><br />

        <button type="submit">Save Business Profile</button>

        <button
          type="button"
          id="applyTemplateButton"
        >
          Apply Industry Template
        </button>

      </form>

      <form id="customFieldForm">
  <h2>Custom Booking Fields</h2>

  <input type="text" id="customFieldLabel" placeholder="Field Label" />
  <br /><br />

  <label>Field Type</label>
  <select id="customFieldType">
  <option value="text">Text</option>
  <option value="number">Number</option>
  <option value="date">Date</option>
  <option value="time">Time</option>
  <option value="textarea">Long Text</option>
  <option value="checkbox">Checkbox</option>
  <option value="dropdown">Dropdown</option>
</select>
  <br /><br />

  <textarea
  id="customFieldOptions"
  placeholder="Dropdown options, one per line. Example:&#10;1 - Lowest&#10;2&#10;3&#10;10 - Highest"
></textarea>
<br /><br />

<button type="button" id="scaleOptionsButton">
  Use 1-10 Scale
</button>

<br /><br />

  <label>
    <input type="checkbox" id="customFieldRequired" />
    Required field
  </label>
  <br /><br />

  <button type="submit">Add Custom Field</button>
</form>

  <div id="customFieldsList"></div>
</div>

      <div id="operationsSettingsSection" style="display:none;">
      <form id="operationalSettingsForm">
        <h2>Operational Settings</h2>

        <label>Opening Time</label>
        <input
          type="time"
          id="openingTime"
          value="${settings.opening_time}"
        />
        <br /><br />

        <label>Closing Time</label>
        <input
          type="time"
          id="closingTime"
          value="${settings.closing_time}"
        />
        <br /><br />

        <label>Maximum Guests Per Slot</label>
        <input
          type="number"
          id="maxGuestsPerSlot"
          value="${settings.max_guests_per_slot}"
        />
        <br /><br />

        <label>Default Reservation Duration (minutes)</label>
        <input
          type="number"
          id="defaultDurationMinutes"
          value="${settings.default_duration_minutes}"
        />
        <br /><br />

        <button type="submit">
          Save Operational Settings
        </button>
      </form> 
      </div>

      <div id="brandingSettingsSection" style="display:none;">
      <form id="brandingForm">
        <h2>Brand Settings</h2>

        <input type="text" id="restaurantName" value="${branding.restaurant_name}" placeholder="Restaurant Name" />
        <br /><br />

        <label>Primary Color</label>
        <input type="color" id="primaryColor" value="${branding.primary_color}" />
        <br /><br />

        <label>Background Start</label>
        <input type="color" id="backgroundStart" value="${branding.background_start}" />
        <br /><br />

        <label>Background End</label>
        <input type="color" id="backgroundEnd" value="${branding.background_end}" />
        <br /><br />

        <button type="submit">Save Brand Settings</button>
      </form>

       <form id="logoForm">
        <h2>Logo Upload</h2>

        <input type="file" id="logoUpload" accept="image/*" />
        <br /><br />

        <button type="submit">Upload Logo</button>
      </form>

       </div>


      <div id="brandingMessage"></div>
    
      `

    const businessProfileForm = document.getElementById('businessProfileForm')
    const brandingForm = document.getElementById('brandingForm')
    const logoForm = document.getElementById('logoForm')
    const brandingMessage = document.getElementById('brandingMessage')
    const operationalSettingsForm = document.getElementById('operationalSettingsForm')
    const customFieldForm = document.getElementById('customFieldForm')
    const scaleOptionsButton = document.getElementById('scaleOptionsButton')
    const customFieldsList = document.getElementById('customFieldsList')
    const applyTemplateButton = document.getElementById('applyTemplateButton')
    const businessTabButton = document.getElementById('businessTabButton')
    const operationsTabButton = document.getElementById('operationsTabButton')
    const brandingTabButton = document.getElementById('brandingTabButton')

    const businessSettingsSection = document.getElementById('businessSettingsSection')
    const operationsSettingsSection = document.getElementById('operationsSettingsSection')
    const brandingSettingsSection = document.getElementById('brandingSettingsSection')

    async function applyIndustryTemplate(template) {
      const templates = {
        restaurant: [
          'Occasion',
          'Allergies',
          'Seating Preference'
        ],

        salon: [
          'Service Type',
          'Preferred Stylist',
          'Hair Length'
        ],

        physiotherapy: [
          'Main Concern',
          'First Visit',
          'Preferred Therapist'
        ],

        general: []
      }

      await supabase
        .from('booking_custom_fields')
        .update({ is_active: false })
        .eq('business_id', currentBusinessId)
        .eq('is_active', true)

      const fields = templates[template] || []

      for (let i = 0; i < fields.length; i++) {
        await supabase
          .from('booking_custom_fields')
           .insert([
            {
              business_id: currentBusinessId,
              field_label: fields[i],
              field_type: 'text',
              is_required: false,
              display_order: i + 1,
              is_active: true
            }
          ])
  }

  loadCustomFieldsList()

  brandingMessage.innerHTML =
    '<p style="color:green">Industry template applied.</p>'
}

    function showSettingsTab(tabName) {
      businessSettingsSection.style.display = 'none'
      operationsSettingsSection.style.display = 'none'
      brandingSettingsSection.style.display = 'none'

      businessTabButton.classList.remove('active')
      operationsTabButton.classList.remove('active')
      brandingTabButton.classList.remove('active')

      if (tabName === 'business') {
      businessSettingsSection.style.display = 'block'
      businessTabButton.classList.add('active')
      }

      if (tabName === 'operations') {
        operationsSettingsSection.style.display = 'block'
        operationsTabButton.classList.add('active')
      }

      if (tabName === 'branding') {
        brandingSettingsSection.style.display = 'block'
        brandingTabButton.classList.add('active')
      }
    }

    let editingCustomFieldId = null

    async function loadCustomFieldsList() {
    const fields = await loadCustomFields()

  if (fields.length === 0) {
    customFieldsList.innerHTML = '<p>No custom fields yet.</p>'
    return
  }

  customFieldsList.innerHTML = fields.map((field) => `
    <div style="border:1px solid #ccc; padding:12px; margin-bottom:10px; border-radius:8px;">
      <strong>${field.field_label}</strong><br>
      Type: ${field.field_type}<br>
      Required: ${field.is_required ? 'Yes' : 'No'}<br><br>

  <button 
  class="edit-field-button" 
  data-id="${field.id}"
  data-label="${field.field_label}"
  data-type="${field.field_type}"
  data-required="${field.is_required}"
  data-options="${field.field_options || ''}"
>
  Edit Field
</button>

<button class="move-field-up-button" data-id="${field.id}">
  ↑ Up
</button>

<button class="move-field-down-button" data-id="${field.id}">
  ↓ Down
</button>

<button class="delete-field-button" data-id="${field.id}">
  Delete Field
</button>

    </div>
  `).join('')
}
    businessProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault()

    const updatedProfile = {
      business_name: document.getElementById('businessName').value,
      business_type: document.getElementById('businessType').value,
      industry_template: document.getElementById('industryTemplate').value,
      booking_label: document.getElementById('bookingLabel').value,
      customer_label: document.getElementById('customerLabel').value,
      capacity_label: document.getElementById('capacityLabel').value,
      uses_capacity: document.getElementById('usesCapacity').checked
  }

  const { error } = await supabase
    .from('business_profile')
    .update(updatedProfile)
    .eq('business_id', currentBusinessId)

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not save business profile.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Business profile saved. Refresh page to see changes.</p>'
})

brandingForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const updatedBranding = {
    restaurant_name: document.getElementById('restaurantName').value,
    primary_color: document.getElementById('primaryColor').value,
    background_start: document.getElementById('backgroundStart').value,
    background_end: document.getElementById('backgroundEnd').value
  }

  const { error } = await supabase
    .from('restaurant_branding')
    .update(updatedBranding)
    .eq('id', branding.id)

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not save brand settings.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Brand settings saved. Refresh page to see changes.</p>'
})

operationalSettingsForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const updatedSettings = {
    opening_time: document.getElementById('openingTime').value,
    closing_time: document.getElementById('closingTime').value,
    max_guests_per_slot: parseInt(document.getElementById('maxGuestsPerSlot').value),
    default_duration_minutes: parseInt(document.getElementById('defaultDurationMinutes').value)
  }

  const { error } = await supabase
    .from('restaurant_settings')
    .update(updatedSettings)
    .eq('business_id', currentBusinessId)

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not save operational settings.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Operational settings saved.</p>'
})

  scaleOptionsButton.addEventListener('click', () => {
  document.getElementById('customFieldOptions').value =
    `1 - Lowest
2
3
4
5
6
7
8
9
10 - Highest`
})

customFieldForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const field_label = document.getElementById('customFieldLabel').value.trim()
  const field_type = document.getElementById('customFieldType').value
  const field_options = document.getElementById('customFieldOptions').value.trim()
  const is_required = document.getElementById('customFieldRequired').checked

  if (!field_label) {
    brandingMessage.innerHTML = '<p style="color:red">Please enter a field label.</p>'
    return
  }

  if (editingCustomFieldId) {
  const { error } = await supabase
    .from('booking_custom_fields')
    .update({
      field_label,
      field_type,
      field_options,
      is_required
    })
    .eq('id', editingCustomFieldId)

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not update custom field.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Custom field updated.</p>'

  editingCustomFieldId = null
  customFieldForm.reset()
  customFieldForm.querySelector('button[type="submit"]').textContent = 'Add Custom Field'
  
  loadCustomFieldsList()
  return
}


  const { data: existingFields } = await supabase
    .from('booking_custom_fields')
    .select('*')

  const display_order = existingFields.length + 1

  const { error } = await supabase
    .from('booking_custom_fields')
    .insert([
      {
        business_id: currentBusinessId,
        field_label,
        field_type,
        field_options,
        is_required,
        display_order,
        is_active: true
      }
    ])

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not add custom field.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Custom field added.</p>'
  customFieldForm.reset()
  loadCustomFieldsList()
})

async function moveCustomField(fieldId, direction) {
  const fields = await loadCustomFields()

  const currentIndex = fields.findIndex(
    field => String(field.id) === String(fieldId)
  )

  if (currentIndex === -1) {
    return
  }

  const swapIndex =
    direction === 'up'
      ? currentIndex - 1
      : currentIndex + 1

  if (swapIndex < 0 || swapIndex >= fields.length) {
    return
  }

  const currentField = fields[currentIndex]
  const swapField = fields[swapIndex]

  await supabase
    .from('booking_custom_fields')
    .update({ display_order: swapField.display_order })
    .eq('id', currentField.id)

  await supabase
    .from('booking_custom_fields')
    .update({ display_order: currentField.display_order })
    .eq('id', swapField.id)

  loadCustomFieldsList()
}

customFieldsList.addEventListener('click', async (e) => {
  if (e.target.classList.contains('move-field-up-button')) {
  const fieldId = e.target.dataset.id
  await moveCustomField(fieldId, 'up')
  return
}

if (e.target.classList.contains('move-field-down-button')) {
  const fieldId = e.target.dataset.id
  await moveCustomField(fieldId, 'down')
  return
}

  if (e.target.classList.contains('edit-field-button')) {
  editingCustomFieldId = e.target.dataset.id

  document.getElementById('customFieldLabel').value = e.target.dataset.label
  document.getElementById('customFieldType').value = e.target.dataset.type
  document.getElementById('customFieldRequired').checked =
    e.target.dataset.required === 'true'

  customFieldForm.querySelector('button[type="submit"]').textContent =
    'Update Custom Field'

  brandingMessage.innerHTML =
    '<p style="color:green">Editing custom field. Update the form and save.</p>'

  return
}

  if (e.target.classList.contains('delete-field-button')) {
    const fieldId = e.target.dataset.id

    const confirmDelete = confirm('Delete this custom field? Existing bookings will keep their saved answers.')

    if (!confirmDelete) {
      return
    }

    const { error } = await supabase
      .from('booking_custom_fields')
      .delete()
      .eq('id', fieldId)

    if (error) {
      console.error(error)
      brandingMessage.innerHTML = '<p style="color:red">Could not delete custom field.</p>'
      return
    }

    brandingMessage.innerHTML = '<p style="color:green">Custom field deleted.</p>'
    loadCustomFieldsList()
  }
})

    logoForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const logoUpload = document.getElementById('logoUpload')
      const file = logoUpload.files[0]

      if (!file) {
        brandingMessage.innerHTML = '<p style="color:red">Please choose an image first.</p>'
        return
      }

      const fileName = `logo-${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('restaurant-logos')
        .upload(fileName, file)

      if (uploadError) {
        console.error(uploadError)
        brandingMessage.innerHTML = '<p style="color:red">Logo upload failed.</p>'
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from('restaurant-logos')
        .getPublicUrl(fileName)

      const logoUrl = publicUrlData.publicUrl

      const { error: updateError } = await supabase
        .from('restaurant_branding')
        .update({ logo_url: logoUrl })
        .eq('id', branding.id)

      if (updateError) {
        console.error(updateError)
        brandingMessage.innerHTML = '<p style="color:red">Logo uploaded but branding update failed.</p>'
        return
      }

      brandingMessage.innerHTML = '<p style="color:green">Logo uploaded successfully. Refresh page to see it.</p>'
    })

      businessTabButton.addEventListener('click', () => {
        showSettingsTab('business')
      })

      operationsTabButton.addEventListener('click', () => {
        showSettingsTab('operations')
      })

      brandingTabButton.addEventListener('click', () => {
        showSettingsTab('branding')
      })

      applyTemplateButton.addEventListener('click', async () => {

  const template =
    document.getElementById('industryTemplate').value

  const confirmed = confirm(
    'Replace current custom fields with this template? Existing bookings will keep their saved answers.'
  )

  if (!confirmed) {
    return
  }

  await applyIndustryTemplate(template)
})

  showSettingsTab('business')

    loadCustomFieldsList()

  }
}

  if (pageRoute === '/admin/analytics') {

  const branding = await loadBranding()
  const profile = await loadBusinessProfile()

  if (!requireAdminPassword()) {
    document.querySelector('#app').innerHTML = `
      <h1>Access Denied</h1>
      <p>You are not authorized to view this page.</p>
    `
  } else {

    document.querySelector('#app').innerHTML = `
      ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}

      <h1>${profile.business_name} Analytics</h1>

      <div class="admin-nav">
        <a href="/${currentBusinessSlug}/admin">Dashboard</a>
        <a href="/${currentBusinessSlug}/admin/analytics">Analytics</a>
        <a href="/${currentBusinessSlug}/admin/settings">Settings</a>
      </div>

      <label>Start Date</label>
      <input type="date" id="analyticsStartDate" />

      <br /><br />

      <label>End Date</label>
      <input type="date" id="analyticsEndDate" />

      <br /><br />

      <button id="loadAnalyticsButton">
        Load Analytics
      </button>

      <hr>

      <div id="analyticsResults">
        Select a date range and click Load Analytics.
      </div>
    `

    const analyticsStartDate = document.getElementById('analyticsStartDate')
    const analyticsEndDate = document.getElementById('analyticsEndDate')
    const loadAnalyticsButton = document.getElementById('loadAnalyticsButton')
    const analyticsResults = document.getElementById('analyticsResults')

    const today = new Date().toISOString().split('T')[0]

analyticsStartDate.value = today
analyticsEndDate.value = today

async function loadAnalytics() {
  const startDate = analyticsStartDate.value
  const endDate = analyticsEndDate.value

  const { data, error } = await supabase
  .from('reservations')
  .select('*')
  .eq('business_id', currentBusinessId)
  .gte('reservation_date', startDate)
  .lte('reservation_date', endDate)

  if (error) {
    console.error(error)
    analyticsResults.innerHTML = `
      <p style="color:red">Could not load analytics.</p>
    `
    return
  }

  const totalReservations = data.length

  const confirmed = data.filter(
    reservation => reservation.status === 'confirmed'
  )

  const completed = data.filter(
    reservation => reservation.status === 'completed'
  )

  const cancelled = data.filter(
    reservation => reservation.status === 'cancelled'
  )

  const noShows = data.filter(
    reservation => reservation.status === 'no_show'
  )

  const archived = data.filter(
    reservation => reservation.is_archived
  )

  const totalCapacityUnits = data.reduce(
  (total, reservation) => total + reservation.party_size,
  0
)

  const completionRate =
    totalReservations > 0
      ? Math.round((completed.length / totalReservations) * 100)
      : 0

  const cancellationRate =
    totalReservations > 0
      ? Math.round((cancelled.length / totalReservations) * 100)
      : 0

  const noShowRate =
    totalReservations > 0
      ? Math.round((noShows.length / totalReservations) * 100)
      : 0

  const averageCapacityUnits =
  totalReservations > 0
    ? (totalCapacityUnits / totalReservations).toFixed(1)
    : 0

  const timeCounts = {}

  data.forEach((reservation) => {
    const time = reservation.reservation_time

    if (!timeCounts[time]) {
      timeCounts[time] = 0
    }

    timeCounts[time] += 1
  })

  let busiestTime = 'N/A'
  let busiestTimeCount = 0

  Object.entries(timeCounts).forEach(([time, count]) => {
    if (count > busiestTimeCount) {
      busiestTime = time
      busiestTimeCount = count
    }
  })

  analyticsResults.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Total ${profile.booking_label}s</h3>
        <p>${totalReservations}</p>
      </div>

      ${
  profile.uses_capacity
    ? `
      <div class="summary-card">
        <h3>Total ${profile.capacity_label}</h3>
        <p>${totalCapacityUnits}</p>
      </div>
    `
    : ''
}

      <div class="summary-card">
        <h3>Confirmed</h3>
        <p>${confirmed.length}</p>
      </div>

      <div class="summary-card">
        <h3>Completed</h3>
        <p>${completed.length}</p>
      </div>

      <div class="summary-card">
        <h3>Cancelled</h3>
        <p>${cancelled.length}</p>
      </div>

      <div class="summary-card">
        <h3>No Shows</h3>
        <p>${noShows.length}</p>
      </div>

      <div class="summary-card">
        <h3>Archived</h3>
        <p>${archived.length}</p>
      </div>

      <div class="summary-card">
        <h3>Completion Rate</h3>
        <p>${completionRate}%</p>
      </div>

      <div class="summary-card">
        <h3>Cancellation Rate</h3>
        <p>${cancellationRate}%</p>
      </div>

      <div class="summary-card">
        <h3>No Show Rate</h3>
        <p>${noShowRate}%</p>
      </div>

    </div>
  `
}

loadAnalyticsButton.addEventListener('click', loadAnalytics)

loadAnalytics()
      }
}