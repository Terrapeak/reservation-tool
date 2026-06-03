import './style.css'
import { supabase } from './supabaseclient.js'

const currentPage = window.location.pathname
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
    .limit(1)
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
    .eq('id', 1)
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

if (currentPage === '/') {
  const branding = await loadBranding()
  document.querySelector('#app').innerHTML = `
  ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
  <h1>${branding.restaurant_name} Reservations</h1>

  <form id="reservationForm">
    <input type="text" id="name" placeholder="Customer Name" required />
    <br /><br />

    <input type="text" id="phone" placeholder="Phone Number" required />
    <br /><br />

    <input type="date" id="date" required />
    <br /><br />

    <input type="time" id="time" required />
    <br /><br />

    <input type="number" id="guests" placeholder="Number of Guests" required />
    <br /><br />

    <textarea id="request" placeholder="Special Requests"></textarea>
    <br /><br />

    <button type="submit">Create Reservation</button>
  </form>

  <hr>

  <div id="message"></div>
<hr>

<h2>Cancel Reservation</h2>

<form id="cancelForm">
  <input type="text" id="cancelReference" placeholder="Reservation Reference" required />
  <br /><br />

  <button type="submit">Cancel Reservation</button>
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
  const party_size = parseInt(document.getElementById('guests').value)
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

  const { error } = await supabase
    .from('reservations')
    .insert([
      {
        customer_name,
        phone,
        reservation_date,
        reservation_time,
        party_size,
        special_request,
        reservation_reference
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
        No active reservation found with that reference number.
      </p>
    `

    cancelButton.disabled = false
    cancelButton.textContent = 'Cancel Reservation'

    return
  }

  cancelMessage.innerHTML = `
    <p style="color:green">
      Reservation ${reservation_reference} has been cancelled.
    </p>
  `

  cancelForm.reset()

  cancelButton.disabled = false
  cancelButton.textContent = 'Cancel Reservation'
})

}

if (currentPage === '/admin') {
  const branding = await loadBranding()

  if (!requireAdminPassword()) {
  document.querySelector('#app').innerHTML = `
    <h1>Access Denied</h1>
    <p>You are not authorized to view this page.</p>
  `
} else {
  document.querySelector('#app').innerHTML = `
  ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
  <h1>${branding.restaurant_name} Admin Dashboard</h1>

  <div class="admin-nav">
  <a href="/admin">Dashboard</a>
  <a href="/admin/analytics">Analytics</a>
  <a href="/admin/settings">Settings</a>
</div>

    <input 
  type="text" 
  id="searchReference" 
  placeholder="Search by reference number"
/>

<button id="searchButton">Search</button>
<button id="refreshButton">Show All Reservations</button>
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
        <h3>Reservations</h3>
        <p>${selectedReservations.length}</p>
      </div>

      <div class="summary-card">
        <h3>Guests Today</h3>
        <p>${totalGuests}</p>
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
      Request: ${reservation.special_request || 'None'}<br><br>

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
      Request: ${reservation.special_request || 'None'}<br><br>

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
  loadAdminReservations()
}
}

if (currentPage === '/admin/settings') {
  const branding = await loadBranding()
  const { data: settings } = await supabase
    .from('restaurant_settings')
    .select('*')
    .eq('id', 1)
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
        <a href="/admin">Dashboard</a>
        <a href="/admin/analytics">Analytics</a>
        <a href="/admin/settings">Settings</a>
      </div>

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

      <form id="logoForm">
        <h2>Logo Upload</h2>

        <input type="file" id="logoUpload" accept="image/*" />
        <br /><br />

        <button type="submit">Upload Logo</button>
      </form>

      <div id="brandingMessage"></div>
    `

    const brandingForm = document.getElementById('brandingForm')
    const logoForm = document.getElementById('logoForm')
    const brandingMessage = document.getElementById('brandingMessage')
    const operationalSettingsForm = document.getElementById('operationalSettingsForm')

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
    .eq('id', 1)

  if (error) {
    console.error(error)
    brandingMessage.innerHTML = '<p style="color:red">Could not save operational settings.</p>'
    return
  }

  brandingMessage.innerHTML = '<p style="color:green">Operational settings saved.</p>'
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

      }
}

  if (currentPage === '/admin/analytics') {

  const branding = await loadBranding()

  if (!requireAdminPassword()) {
    document.querySelector('#app').innerHTML = `
      <h1>Access Denied</h1>
      <p>You are not authorized to view this page.</p>
    `
  } else {

    document.querySelector('#app').innerHTML = `
      ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}

      <h1>${branding.restaurant_name} Analytics</h1>

      <div class="admin-nav">
        <a href="/admin">Dashboard</a>
        <a href="/admin/analytics">Analytics</a>
        <a href="/admin/settings">Settings</a>
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

  const totalGuests = data.reduce(
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

  const averagePartySize =
    totalReservations > 0
      ? (totalGuests / totalReservations).toFixed(1)
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
        <h3>Total Reservations</h3>
        <p>${totalReservations}</p>
      </div>

      <div class="summary-card">
        <h3>Total Guests</h3>
        <p>${totalGuests}</p>
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

      <div class="summary-card">
        <h3>Avg Party Size</h3>
        <p>${averagePartySize}</p>
      </div>

      <div class="summary-card">
        <h3>Busiest Time</h3>
        <p>${busiestTime}</p>
      </div>
    </div>
  `
}

loadAnalyticsButton.addEventListener('click', loadAnalytics)

loadAnalytics()
      }
}