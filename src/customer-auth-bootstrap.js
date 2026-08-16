import { supabase } from './supabaseclient.js'

const searchParams = new URLSearchParams(window.location.search)
const isCustomerDashboardView = searchParams.get('customerView') === '1'
const TERRAPEAK_DASHBOARD_ORIGINS = new Set([
  'https://dashboard.terrapeakgroup.com',
  'https://platform.terrapeakgroup.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175'
])

const pathParts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = pathParts[0] || ''
const managementSegments = new Set([
  'admin',
  'dashboard',
  'analytics',
  'settings',
  'services',
  'staff',
  'schedule',
  'availability'
])
const reservedSegments = new Set([...managementSegments, 'book', 'onboarding'])
const isManagementRoute = pathParts.length > 1 && managementSegments.has(String(pathParts[1] || '').toLowerCase())

async function validateBusinessRoute() {
  if (!businessSlug || reservedSegments.has(businessSlug.toLowerCase())) {
    return null
  }

  const { data, error } = await supabase.rpc('get_public_booking_business', {
    p_business_slug: businessSlug
  })

  if (error) {
    console.error('Could not validate Reservations tenant:', error)
    return null
  }

  return Array.isArray(data) ? data[0] || null : data || null
}

function renderUnavailable(message = 'This Reservations workspace is not configured or the link is invalid.') {
  document.querySelector('#app').innerHTML = `
    <main class="auth-card">
      <h1>Reservations workspace not available</h1>
      <p>${message}</p>
      <a href="https://dashboard.terrapeakgroup.com/dashboard/reservations" target="_top">Return to TerraPeak Reservations</a>
    </main>
  `
}

function getTrustedParentOrigin() {
  if (!document.referrer) return ''

  try {
    const origin = new URL(document.referrer).origin
    return TERRAPEAK_DASHBOARD_ORIGINS.has(origin) ? origin : ''
  } catch {
    return ''
  }
}

async function establishSupabaseSession(bootstrap) {
  const { data: sessionData } = await supabase.auth.getSession()
  const currentSession = sessionData?.session || null

  if (
    currentSession?.user?.id &&
    bootstrap?.supabaseUserId &&
    currentSession.user.id === bootstrap.supabaseUserId
  ) {
    return { error: null, reused: true }
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: bootstrap.tokenHash,
    type: bootstrap.type || 'email'
  })

  return { error, reused: false }
}

function storeTrustedContext(bootstrap) {
  window.__TERRAPEAK_RESERVATIONS_CONTEXT__ = Object.freeze({
    companyId: String(bootstrap.companyId || ''),
    companyRole: String(bootstrap.companyRole || 'viewer').toLowerCase(),
    capabilities: Object.freeze({ ...(bootstrap.capabilities || {}) }),
    reservationsCompatibilityRole: String(bootstrap.reservationsCompatibilityRole || ''),
    businessId: Number(bootstrap.businessId),
    businessSlug: bootstrap.businessSlug,
    supabaseUserId: String(bootstrap.supabaseUserId || ''),
    source: 'terrapeak-dashboard'
  })
  window.__TERRAPEAK_RESERVATIONS_READY__ = true
}

function startCustomerDashboardView(validBusiness) {
  const parentOrigin = getTrustedParentOrigin()
  if (!parentOrigin || window.parent === window) {
    renderUnavailable('Reservations management must be opened from the TerraPeak Dashboard.')
    return Promise.resolve(false)
  }

  document.querySelector('#app').innerHTML = `
    <main class="auth-card">
      <h1>Opening Reservations</h1>
      <p>Connecting your TerraPeak workspace...</p>
    </main>
  `

  return new Promise((resolve) => {
    let completed = false
    let sessionExchangeInFlight = false

    const finish = (result) => {
      window.removeEventListener('message', receiveSession)
      resolve(result)
    }

    const receiveSession = async (event) => {
      if (completed || sessionExchangeInFlight || event.source !== window.parent) return
      if (event.origin !== parentOrigin) return
      if (event.data?.type !== 'terrapeak:reservations-session') return

      const bootstrap = event.data.bootstrap
      if (
        !bootstrap?.tokenHash ||
        bootstrap.businessSlug !== businessSlug ||
        Number(bootstrap.businessId) !== Number(validBusiness.id)
      ) {
        completed = true
        renderUnavailable('The TerraPeak company does not match this Reservations workspace.')
        finish(false)
        return
      }

      sessionExchangeInFlight = true
      const { error } = await establishSupabaseSession(bootstrap)

      if (error) {
        completed = true
        console.error('Could not establish Reservations session:', error)
        renderUnavailable('Your TerraPeak Reservations session could not be established. Return to the dashboard and try again.')
        finish(false)
        return
      }

      completed = true
      storeTrustedContext(bootstrap)
      finish(true)
    }

    window.addEventListener('message', receiveSession)
    window.parent.postMessage(
      { type: 'terrapeak:reservations-ready', businessSlug },
      parentOrigin
    )

    window.setTimeout(() => {
      if (completed) return
      completed = true
      renderUnavailable('The TerraPeak Reservations connection timed out. Return to the dashboard and try again.')
      finish(false)
    }, 12000)
  })
}

const validBusiness = await validateBusinessRoute()

if (!validBusiness) {
  renderUnavailable()
} else if (isManagementRoute && !isCustomerDashboardView) {
  renderUnavailable('Reservations management is controlled by TerraPeak. Open this company from the TerraPeak Dashboard instead of signing in separately.')
} else if (isCustomerDashboardView) {
  await startCustomerDashboardView(validBusiness)
} else {
  await import('./main.js')
}
