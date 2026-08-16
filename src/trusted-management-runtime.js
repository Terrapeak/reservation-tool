import { supabase } from './supabaseclient.js'

const context = window.__TERRAPEAK_RESERVATIONS_CONTEXT__
const params = new URLSearchParams(window.location.search)
const isCustomerManagement =
  params.get('customerView') === '1' &&
  window.__TERRAPEAK_RESERVATIONS_READY__ === true

if (isCustomerManagement) {
  const trustedBusinessId = Number(context?.businessId)
  const trustedBusinessSlug = String(context?.businessSlug || '')

  if (!Number.isFinite(trustedBusinessId) || trustedBusinessId <= 0 || !trustedBusinessSlug) {
    throw new Error('Trusted TerraPeak Reservations context is incomplete.')
  }

  const routeSlug = window.location.pathname.split('/').filter(Boolean)[0] || ''
  if (routeSlug !== trustedBusinessSlug) {
    throw new Error('Reservations route does not match the TerraPeak company context.')
  }

  const originalFrom = supabase.from.bind(supabase)
  const businessScopedTables = new Set([
    'business_memberships',
    'restaurant_branding',
    'restaurant_settings',
    'business_profile',
    'booking_custom_fields',
    'reservations',
    'services',
    'staff_members',
    'availability_rules',
    'availability_exceptions',
    'resources',
    'bookings',
    'scheduled_sessions'
  ])

  supabase.from = (table) => {
    const builder = originalFrom(table)

    if (table === 'businesses') {
      return new Proxy(builder, {
        get(target, property, receiver) {
          if (property !== 'select') {
            const value = Reflect.get(target, property, receiver)
            return typeof value === 'function' ? value.bind(target) : value
          }

          return (...args) => target.select(...args).eq('id', trustedBusinessId)
        }
      })
    }

    if (!businessScopedTables.has(table)) {
      return builder
    }

    return new Proxy(builder, {
      get(target, property, receiver) {
        if (property !== 'select') {
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }

        return (...args) => target.select(...args).eq('business_id', trustedBusinessId)
      }
    })
  }

  supabase.auth.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: new Error('Reservations management authentication is controlled by TerraPeak.')
  })

  window.__TERRAPEAK_RESERVATIONS_RUNTIME__ = Object.freeze({
    businessId: trustedBusinessId,
    businessSlug: trustedBusinessSlug,
    companyRole: String(context?.companyRole || 'viewer').toLowerCase(),
    capabilities: Object.freeze({ ...(context?.capabilities || {}) }),
    source: 'terrapeak-dashboard'
  })
}
