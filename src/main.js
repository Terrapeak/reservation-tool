import './style.css'
import { supabase } from './supabaseClient.js'

document.querySelector('#app').innerHTML = `
  <h1>Dim Sum Dragon Reservations</h1>

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

`

const form = document.getElementById('reservationForm')
const submitButton = form.querySelector('button[type="submit"]')

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

