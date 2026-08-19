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
  const compatibilityRole = String(
    context?.reservationsCompatibilityRole ||
    (companyRole === 'admin' ? 'owner' : companyRole)
  ).toLowerCase()
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
    const membership = { role: compatibilityRole }
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      limit: () => builder,
      single: async () => ({ data: membership, error: null }),
      maybeSingle: async () => ({ data: membership, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: [membership], error: null }).then(resolve, reject)
    }
    return builder
  }

  function normalizeTenantPayload(payload) {
    const normalizeRecord = (record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return record
      return { ...record, business_id: trustedBusinessId }
    }

    return Array.isArray(payload)
      ? payload.map(normalizeRecord)
      : normalizeRecord(payload)
  }

  function protectMutations(table, builder) {
    const capability = tableMutationCapability[table]
    const availabilityAllowed = availabilityTables.has(table) &&
      hasCapability('manageAvailability')

    return new Proxy(builder, {
      get(target, property, receiver) {
        if (['insert', 'update', 'upsert', 'delete'].includes(property)) {
          const allowed = availabilityTables.has(table)
            ? availabilityAllowed
            : !capability || hasCapability(capability)

          if (!allowed) {
            return async () => denied(`Your TerraPeak role cannot modify ${table.replaceAll('_', ' ')}.`)
          }

          if (property === 'insert' || property === 'upsert') {
            return (payload, ...args) => {
              const normalized = businessScopedTables.has(table)
                ? normalizeTenantPayload(payload)
                : payload
              return target[property](normalized, ...args)
            }
          }

          if (property === 'update') {
            return (payload, ...args) => {
              const sanitized = payload && typeof payload === 'object'
                ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'business_id'))
                : payload
              return target.update(sanitized, ...args)
            }
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
      // TerraPeak CompanyMembership is authoritative. Legacy modules receive a
      // compatibility role only so their old UI branches cannot create a second
      // authorization system while they are being removed.
      return syntheticMembershipBuilder()
    }

    const builder = originalFrom(table)
    return protectMutations(table, builder)
  }

  const rpcCapability = Object.freeze({
    update_class_service_setup_v2: 'manageServices',
    create_scheduled_sessions: 'manageAvailability',
    update_scheduled_session: 'manageAvailability',
    cancel_scheduled_session: 'manageAvailability',
    set_scheduled_booking_status: 'manageBookings'
  })

  supabase.rpc = async (fn, args = {}, options) => {
    const requiredCapability = rpcCapability[fn]
    if (requiredCapability && !hasCapability(requiredCapability)) {
      return denied(`Your TerraPeak role cannot perform ${fn.replaceAll('_', ' ')}.`)
    }

    const normalizedArgs = fn === 'create_scheduled_sessions'
      ? { ...args, p_business_id: trustedBusinessId }
      : args

    return originalRpc(fn, normalizedArgs, options)
  }

  supabase.auth.signInWithPassword = async () => denied(
    'Reservations management authentication is controlled by TerraPeak.'
  )

  window.__TERRAPEAK_RESERVATIONS_RUNTIME__ = Object.freeze({
    businessId: trustedBusinessId,
    businessSlug: trustedBusinessSlug,
    companyRole,
    compatibilityRole,
    capabilities,
    hasCapability,
    source: 'terrapeak-dashboard'
  })
}
