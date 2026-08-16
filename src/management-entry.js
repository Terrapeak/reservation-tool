const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__

if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')
const legacyRoutes = new Set(['admin', 'admin/analytics', 'admin/settings'])
const universalRoutes = new Set([
  'admin/services',
  'admin/staff',
  'admin/schedule',
  'admin/availability'
])

if (!legacyRoutes.has(route) && !universalRoutes.has(route)) {
  throw new Error(`Unsupported Reservations management route: ${route}`)
}

await import('./customer-tenant-lock.js')
await import('./business-name-unification.js')

if (legacyRoutes.has(route)) {
  await import('./main.js')
  await import('./admin-enhancements.js')

  if (route === 'admin/settings') {
    await import('./custom-field-option-repair.js')
  }
}

if (universalRoutes.has(route)) {
  await import('./universal-booking-admin.js')
}

await import('./management-capability-ui.js')
await import('./reservations-management-shell.js')
