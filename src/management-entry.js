import { RESERVATIONS_MANAGEMENT_ROUTE_SET, RESERVATIONS_ROUTE_GROUPS } from './reservations-routes.js'

const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__

if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')

if (!RESERVATIONS_MANAGEMENT_ROUTE_SET.has(route)) {
  throw new Error(`Unsupported Reservations management route: ${route}`)
}

await import('./customer-tenant-lock.js')
await import('./business-name-unification.js')

if (RESERVATIONS_ROUTE_GROUPS.unifiedBookings.has(route)) {
  await import('./unified-bookings-admin.js')
}

if (RESERVATIONS_ROUTE_GROUPS.settings.has(route)) {
  await import('./restaurant-settings.js')
  await import('./admin-enhancements.js')
  await import('./custom-field-option-repair.js')
}

if (RESERVATIONS_ROUTE_GROUPS.customerForm.has(route)) {
  await import('./customer-form-admin.js')
  await import('./admin-enhancements.js')
}

if (RESERVATIONS_ROUTE_GROUPS.universal.has(route)) {
  await import('./universal-booking-admin.js')
  await import('./reservation-template-preview.js')
}

await import('./management-capability-ui.js')
await import('./reservations-management-shell.js')
