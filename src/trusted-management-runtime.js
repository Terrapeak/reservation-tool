import { supabase } from './supabaseclient.js'

const context = window.__TERRAPEAK_RESERVATIONS_CONTEXT__
const params = new URLSearchParams(window.location.search)
const isCustomerManagement =
  params.get('customerView') === '1' &&
  window.__TERRAPEAK_RESERVATIONS_READY__ === true

if (isCustomerManagement) {
  const trustedBusinessId = Number(context?.businessId)
  const trustedBusinessSlug = String(context?.businessSlug || '')
  const companyRole = String(context?.companyRole || 'viewer').toLowerCase()
  const capabilities = Object.freeze({ ...(context?.capabilities || {}) })

  if (!Number.isFinite(trustedBusinessId) || trustedBusinessId <= 0 || !trustedBusinessSlug) {
    throw new Error('Trusted TerraPeak Reservations context is incomplete.')
  }

  const routeSlug = window.location.pathname.split('/').filter(Boolean)[0] || ''
  if (routeSlug !== trustedBusinessSlug) {
    throw new Error('Reservations route does not match the TerraPeak company context.')
  }

  const hasCapability = (name) => capabilities[name] === true
  const denied = (message) => ({
    data: null,
    error: new Error(message || 'This action is not permitted for your TerraPeak company role.')
  })

  const originalFrom = supabase.from.bind(supabase)
  const originalRpc = supabase.rpc.bind(supabase)

  const businessScopedTables = new Set([
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

  const tableMutationCapability = Object.freeze({
    services: 'manageServices',
    staff_members: 'manageTeam',
    staff_services: 'manageTeam',
    scheduled_sessions: 'manageAvailability',
    reservations: 'manageBookings',
    bookings: 'manageBookings',
    restaurant_branding: 'manageSettings',
    restaurant_settings: 'manageSettings',
    business_profile: 'manageSettings',
    booking_custom_fields: 'manageSettings'
  })

  const availabilityTables = new Set([
    'availability_rules',
    'availability_exceptions'
  ])

  function syntheticMembershipBuilder() {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      limit: () => builder,
      single: async () => ({ data: { role: companyRole }, error: null }),
      maybeSingle: async () => ({ data: { role: companyRole }, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: [{ role: companyRole }], error: null }).then(resolve, reject)
    }
    return builder
  }

  function protectMutations(table, builder) {
    const capability = tableMutationCapability[table]
    const availabilityAllowed = availabilityTables.has(table) &&
      (hasCapability('manageAvailability') || hasCapability('manageOwnAvailability'))

    return new Proxy(builder, {
      get(target, property, receiver) {
        if (['insert', 'update', 'upsert', 'delete'].includes(property)) {
          const allowed = availabilityTables.has(table)
            ? availabilityAllowed
            : !capability || hasCapability(capability)

          if (!allowed) {
            return async () => denied(`Your TerraPeak role cannot modify ${table.replaceAll('_', ' ')}.`)
          }
        }

        if (property === 'select') {
          return (...args) => {
            const query = target.select(...args)
            return table === 'businesses'
              ? query.eq('id', trustedBusinessId)
              : businessScopedTables.has(table)
                ? query.eq('business_id', trustedBusinessId)
                : query
          }
        }

        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
  }

  supabase.from = (table) => {
    if (table === 'business_memberships') {
      // CompanyMembership is authoritative. Legacy modules may still ask for a
      // Reservations membership while they are being retired, so answer locally
      // from the already-authenticated TerraPeak context instead of re-authorizing.
      return syntheticMembershipBuilder()
    }

    const builder = originalFrom(table)
    return protectMutations(table, builder)
  }

  const rpcCapability = Object.freeze({
    create_scheduled_sessions: 'manageAvailability',
    update_scheduled_session: 'manageAvailability',
    cancel_scheduled_session: 'manageAvailability',
    set_scheduled_booking_status: 'manageBookings'
  })

  supabase.rpc = async (fn, args, options) => {
    const requiredCapability = rpcCapability[fn]
    if (requiredCapability && !hasCapability(requiredCapability)) {
      return denied(`Your TerraPeak role cannot perform ${fn.replaceAll('_', ' ')}.`)
    }
    return originalRpc(fn, args, options)
  }

  supabase.auth.signInWithPassword = async () => denied(
    'Reservations management authentication is controlled by TerraPeak.'
  )

  window.__TERRAPEAK_RESERVATIONS_RUNTIME__ = Object.freeze({
    businessId: trustedBusinessId,
    businessSlug: trustedBusinessSlug,
    companyRole,
    capabilities,
    hasCapability,
    source: 'terrapeak-dashboard'
  })
}
