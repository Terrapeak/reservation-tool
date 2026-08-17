import { supabase } from './supabaseclient.js'
import { bookingDateTimeParts } from './booking-timezone.js'

const FINAL_STATUSES = new Set(['completed', 'cancelled', 'no_show'])
const CANONICAL_ONLY_VERSION = 2

function normalizeCanonicalBooking(row, restaurantServiceIds, restaurantTimezone) {
  const displayZone = restaurantServiceIds.has(Number(row.service_id))
    ? restaurantTimezone
    : 'UTC'
  const display = bookingDateTimeParts(row.starts_at, displayZone)
  return {
    source: 'bookings',
    id: row.id,
    businessId: Number(row.business_id),
    reference: row.reference || '',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || '',
    bookingDate: display.bookingDate,
    bookingTime: display.bookingTime,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    quantity: Number(row.quantity || 1),
    status: row.status || 'pending',
    notes: row.notes || '',
    archived: FINAL_STATUSES.has(row.status),
    archiveSupported: false,
    serviceId: row.service_id ?? null,
    staffId: row.staff_id ?? null,
    scheduledSessionId: row.scheduled_session_id ?? null,
    raw: row
  }
}

function normalizeLegacyReservation(row) {
  return {
    source: 'reservations',
    id: row.id,
    businessId: Number(row.business_id),
    reference: row.reservation_reference || '',
    customerName: row.customer_name || '',
    customerPhone: row.phone || '',
    customerEmail: '',
    bookingDate: row.reservation_date || '',
    bookingTime: String(row.reservation_time || '').slice(0, 5),
    startsAt: null,
    endsAt: null,
    quantity: Number(row.party_size || 1),
    status: row.status || 'confirmed',
    notes: row.special_request || '',
    archived: Boolean(row.is_archived),
    archiveSupported: true,
    serviceId: null,
    staffId: null,
    scheduledSessionId: null,
    raw: row
  }
}

function nextDate(dateValue) {
  const value = new Date(`${dateValue}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

async function getBookingModelVersion(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('booking_model_version')
    .eq('id', businessId)
    .single()

  if (error) throw error
  return Number(data?.booking_model_version || 1)
}

async function getCanonicalDisplayContext(businessId) {
  const [servicesResult, settingsResult] = await Promise.all([
    supabase
      .from('services')
      .select('id')
      .eq('business_id', businessId)
      .eq('booking_type', 'restaurant'),
    supabase
      .from('restaurant_settings')
      .select('timezone')
      .eq('business_id', businessId)
      .maybeSingle()
  ])

  if (servicesResult.error) throw servicesResult.error
  if (settingsResult.error) throw settingsResult.error

  return {
    restaurantServiceIds: new Set((servicesResult.data || []).map(service => Number(service.id))),
    restaurantTimezone: settingsResult.data?.timezone || 'UTC'
  }
}

function buildCanonicalQuery({ businessId, startDate, endDate, reference }) {
  let query = supabase
    .from('bookings')
    .select('*')
    .eq('business_id', businessId)
    .order('starts_at', { ascending: true })

  if (reference) return query.eq('reference', reference)

  return query
    .gte('starts_at', `${startDate}T00:00:00.000Z`)
    .lt('starts_at', `${nextDate(endDate)}T00:00:00.000Z`)
}

function buildLegacyQuery({ businessId, startDate, endDate, reference }) {
  let query = supabase
    .from('reservations')
    .select('*')
    .eq('business_id', businessId)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true })

  if (reference) return query.eq('reservation_reference', reference)

  return query
    .gte('reservation_date', startDate)
    .lte('reservation_date', endDate)
}

export async function listManagedBookings({ businessId, startDate, endDate, reference = '', viewMode = 'active' }) {
  const [bookingModelVersion, canonicalResult, displayContext] = await Promise.all([
    getBookingModelVersion(businessId),
    buildCanonicalQuery({ businessId, startDate, endDate, reference }),
    getCanonicalDisplayContext(businessId)
  ])
  if (canonicalResult.error) throw canonicalResult.error

  const canonicalRows = (canonicalResult.data || []).map(row => normalizeCanonicalBooking(
    row,
    displayContext.restaurantServiceIds,
    displayContext.restaurantTimezone
  ))
  let rows = canonicalRows

  if (bookingModelVersion < CANONICAL_ONLY_VERSION) {
    const legacyResult = await buildLegacyQuery({ businessId, startDate, endDate, reference })
    if (legacyResult.error) throw legacyResult.error

    const canonicalIds = new Set(canonicalRows.map(row => String(row.id)))
    const canonicalReferences = new Set(canonicalRows.map(row => row.reference).filter(Boolean))
    const legacyRows = (legacyResult.data || [])
      .map(normalizeLegacyReservation)
      .filter(row => !canonicalIds.has(String(row.id)) && (!row.reference || !canonicalReferences.has(row.reference)))

    rows = [...canonicalRows, ...legacyRows]
  }

  if (!reference && viewMode === 'active') rows = rows.filter(row => !row.archived)
  if (!reference && viewMode === 'archived') rows = rows.filter(row => row.archived)

  rows.sort((a, b) => `${a.bookingDate}T${a.bookingTime}`.localeCompare(`${b.bookingDate}T${b.bookingTime}`))
  return rows
}

export async function updateManagedBookingStatus(booking, status) {
  if (booking.source === 'bookings') {
    return supabase.from('bookings').update({ status }).eq('id', booking.id)
  }
  return supabase.from('reservations').update({ status }).eq('id', booking.id)
}

export async function setLegacyBookingArchived(booking, archived) {
  if (booking.source !== 'reservations') {
    return { data: null, error: new Error('Canonical bookings use status rather than the legacy archive flag.') }
  }
  return supabase.from('reservations').update({ is_archived: archived }).eq('id', booking.id)
}
