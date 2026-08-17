import { supabase } from './supabaseclient.js'

const FINAL_STATUSES = new Set(['completed', 'cancelled', 'no_show'])

function normalizeCanonicalBooking(row) {
  const startsAt = row.starts_at ? new Date(row.starts_at) : null
  return {
    source: 'bookings',
    id: row.id,
    businessId: Number(row.business_id),
    reference: row.reference || '',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || '',
    bookingDate: startsAt && !Number.isNaN(startsAt.valueOf())
      ? startsAt.toISOString().slice(0, 10)
      : '',
    bookingTime: startsAt && !Number.isNaN(startsAt.valueOf())
      ? startsAt.toISOString().slice(11, 16)
      : '',
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

export async function listManagedBookings({ businessId, startDate, endDate, reference = '', viewMode = 'active' }) {
  let canonicalQuery = supabase
    .from('bookings')
    .select('*')
    .eq('business_id', businessId)
    .order('starts_at', { ascending: true })

  let legacyQuery = supabase
    .from('reservations')
    .select('*')
    .eq('business_id', businessId)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true })

  if (reference) {
    canonicalQuery = canonicalQuery.eq('reference', reference)
    legacyQuery = legacyQuery.eq('reservation_reference', reference)
  } else {
    canonicalQuery = canonicalQuery
      .gte('starts_at', `${startDate}T00:00:00.000Z`)
      .lt('starts_at', `${nextDate(endDate)}T00:00:00.000Z`)
    legacyQuery = legacyQuery
      .gte('reservation_date', startDate)
      .lte('reservation_date', endDate)
  }

  const [canonicalResult, legacyResult] = await Promise.all([canonicalQuery, legacyQuery])
  if (canonicalResult.error) throw canonicalResult.error
  if (legacyResult.error) throw legacyResult.error

  const canonicalRows = (canonicalResult.data || []).map(normalizeCanonicalBooking)
  const canonicalIds = new Set(canonicalRows.map(row => String(row.id)))
  const canonicalReferences = new Set(canonicalRows.map(row => row.reference).filter(Boolean))

  // During migration, keep legacy rows visible only when they have not yet been
  // represented in the canonical bookings table. This makes the read path safe
  // across partially migrated businesses without double-counting migrated data.
  const legacyRows = (legacyResult.data || [])
    .map(normalizeLegacyReservation)
    .filter(row => !canonicalIds.has(String(row.id)) && (!row.reference || !canonicalReferences.has(row.reference)))

  let rows = [...canonicalRows, ...legacyRows]

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
