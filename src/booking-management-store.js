import { supabase } from './supabaseclient.js'
import { bookingDateTimeParts } from './booking-timezone.js'

const FINAL_STATUSES = new Set(['completed', 'cancelled', 'no_show'])

function normalizeCanonicalBooking(row, context) {
  const displayZone = context.restaurantServiceIds.has(Number(row.service_id)) ? context.restaurantTimezone : 'UTC'
  const display = bookingDateTimeParts(row.starts_at, displayZone)
  const customData = row.custom_data && typeof row.custom_data === 'object' ? row.custom_data : {}
  const customFields = Object.entries(customData)
    .filter(([key]) => key !== 'customer_email')
    .map(([key, value]) => ({
      key,
      label: context.customFieldLabels.get(String(key)) || key,
      value
    }))
  return {
    source: 'bookings', id: row.id, businessId: Number(row.business_id), reference: row.reference || '',
    customerName: row.customer_name || '', customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || customData.customer_email || '',
    bookingDate: display.bookingDate, bookingTime: display.bookingTime,
    startsAt: row.starts_at || null, endsAt: row.ends_at || null, quantity: Number(row.quantity || 1),
    status: row.status || 'pending', notes: row.notes || '', archived: FINAL_STATUSES.has(row.status),
    archiveSupported: false, serviceId: row.service_id ?? null,
    serviceName: context.serviceNames.get(Number(row.service_id)) || '',
    staffId: row.staff_id ?? null, scheduledSessionId: row.scheduled_session_id ?? null,
    customFields, createdAt: row.created_at || null, raw: row
  }
}

function nextDate(dateValue) {
  const value = new Date(`${dateValue}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

async function getCanonicalDisplayContext(businessId) {
  const [servicesResult, settingsResult, fieldsResult] = await Promise.all([
    supabase.from('services').select('id,name,booking_type').eq('business_id', businessId),
    supabase.from('restaurant_settings').select('timezone').eq('business_id', businessId).maybeSingle(),
    supabase.from('booking_custom_fields').select('id,field_label').eq('business_id', businessId).eq('is_active', true)
  ])
  if (servicesResult.error) throw servicesResult.error
  if (settingsResult.error) throw settingsResult.error
  if (fieldsResult.error) throw fieldsResult.error
  const services = servicesResult.data || []
  return {
    restaurantServiceIds: new Set(services.filter(service => service.booking_type === 'restaurant').map(service => Number(service.id))),
    restaurantTimezone: settingsResult.data?.timezone || 'UTC',
    serviceNames: new Map(services.map(service => [Number(service.id), service.name || ''])),
    customFieldLabels: new Map((fieldsResult.data || []).map(field => [String(field.id), field.field_label || String(field.id)]))
  }
}

function buildCanonicalQuery({ businessId, startDate, endDate, reference }) {
  let query = supabase.from('bookings').select('*').eq('business_id', businessId).order('starts_at', { ascending: true })
  if (reference) return query.eq('reference', reference)
  return query.gte('starts_at', `${startDate}T00:00:00.000Z`).lt('starts_at', `${nextDate(endDate)}T00:00:00.000Z`)
}

export async function listManagedBookings({ businessId, startDate, endDate, reference = '', viewMode = 'active' }) {
  const [canonicalResult, displayContext] = await Promise.all([
    buildCanonicalQuery({ businessId, startDate, endDate, reference }), getCanonicalDisplayContext(businessId)
  ])
  if (canonicalResult.error) throw canonicalResult.error
  let rows = (canonicalResult.data || []).map(row => normalizeCanonicalBooking(row, displayContext))
  if (!reference && viewMode === 'active') rows = rows.filter(row => !row.archived)
  if (!reference && viewMode === 'archived') rows = rows.filter(row => row.archived)
  rows.sort((a, b) => `${a.bookingDate}T${a.bookingTime}`.localeCompare(`${b.bookingDate}T${b.bookingTime}`))
  return rows
}

export async function updateManagedBookingStatus(booking, status) {
  return supabase.from('bookings').update({ status }).eq('id', booking.id)
}