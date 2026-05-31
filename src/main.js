import './style.css'
import { supabase } from './supabaseclient.js'

const currentPage = window.location.pathname

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

  if (error) {
    console.error(error)
    return false
  }

  const currentGuests = data.reduce(
    (total, reservation) =>
      total + reservation.party_size,
    0
  )

  const maxGuestsPerSlot = 20

console.log('DATE:', reservation_date)
console.log('TIME:', reservation_time)
console.log('FOUND BOOKINGS:', data)
console.log('CURRENT GUESTS:', currentGuests)
console.log('REQUESTED GUESTS:', requestedGuests)

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
  const openingTime = timeToMinutes('11:00')
  const closingTime = timeToMinutes('22:00')
  const requestedMinutes = timeToMinutes(requested_time)

  const possibleSlots = []

  for (
    let minutes = requestedMinutes + 30;
    minutes < closingTime;
    minutes += 30
  ) {
    possibleSlots.push(minutesToTime(minutes))
  }

  const availableSlots = []

  for (const slot of possibleSlots) {
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

function isWithinOpeningHours(reservation_time) {
  const openingTime = timeToMinutes('11:00')
  const closingTime = timeToMinutes('22:00')
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
if (!isWithinOpeningHours(reservation_time)) {
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
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD
const enteredPassword = prompt('Enter admin password:')

if (enteredPassword !== adminPassword) {
  document.querySelector('#app').innerHTML = `
    <h1>Access Denied</h1>
    <p>You are not authorized to view this page.</p>
  `
} else {
  document.querySelector('#app').innerHTML = `
  ${branding.logo_url ? `<img src="${branding.logo_url}" class="brand-logo" />` : ''}
  <h1>${branding.restaurant_name} Admin Dashboard</h1>

    <input 
  type="text" 
  id="searchReference" 
  placeholder="Search by reference number"
/>

<button id="searchButton">Search</button>
<button id="refreshButton">Show All Reservations</button>
<hr>

<h2>Brand Settings</h2>

<input type="file" id="logoUpload" accept="image/*" />
<button id="uploadLogoButton">Upload Logo</button>

<div id="brandingMessage"></div>

    <hr>

    <div id="adminReservations">Loading reservations...</div>
  `

const refreshButton = document.getElementById('refreshButton')
const searchButton = document.getElementById('searchButton')
const searchReference = document.getElementById('searchReference')
const adminReservations = document.getElementById('adminReservations')
const logoUpload = document.getElementById('logoUpload')
const uploadLogoButton = document.getElementById('uploadLogoButton')
const brandingMessage = document.getElementById('brandingMessage')

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

  async function loadAdminReservations() {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })

    if (error) {
      console.error(error)
      adminReservations.innerHTML = `
        <p style="color:red">Could not load reservations.</p>
      `
      return
    }

    if (data.length === 0) {
      adminReservations.innerHTML = '<p>No reservations found.</p>'
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
Request: ${reservation.special_request || 'None'}<br><br>

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
    : reservation.status
}
<br>
Request: ${reservation.special_request || 'None'}<br><br>

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

})

  refreshButton.addEventListener('click', loadAdminReservations)
  searchButton.addEventListener('click', searchReservationByReference)

  async function uploadLogo() {
  const file = logoUpload.files[0]

  if (!file) {
    brandingMessage.innerHTML = `
      <p style="color:red">Please choose an image first.</p>
    `
    return
  }

  const fileName = `logo-${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('restaurant-logos')
    .upload(fileName, file)

  if (uploadError) {
    console.error(uploadError)
    brandingMessage.innerHTML = `
      <p style="color:red">Logo upload failed.</p>
    `
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
    brandingMessage.innerHTML = `
      <p style="color:red">Logo uploaded but branding update failed.</p>
    `
    return
  }

  brandingMessage.innerHTML = `
    <p style="color:green">Logo uploaded successfully. Refresh page to see it.</p>
  `
}

uploadLogoButton.addEventListener('click', uploadLogo)

  loadAdminReservations()
}
}