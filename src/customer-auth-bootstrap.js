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
const reservedSegments = new Set(['admin', 'dashboard', 'analytics', 'settings', 'services', 'staff', 'schedule', 'availability', 'book', 'onboarding'])

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
      <a href="https://dashboard.terrapeakgroup.com/dashboard/reservations">Return to TerraPeak Reservations</a>
    </main>
  `
}

async function startCustomerDashboardView(validBusiness) {
  document.querySelector('#app').innerHTML = `
    <main class="auth-card">
      <h1>Opening Reservations</h1>
      <p>Connecting your TerraPeak workspace...</p>
    </main>
  `

  let completed = false

  const receiveSession = async (event) => {
    if (completed || event.source !== window.parent) return
    if (!TERRAPEAK_DASHBOARD_ORIGINS.has(event.origin)) return
    if (event.data?.type !== 'terrapeak:reservations-session') return

    const bootstrap = event.data.bootstrap
    if (
      !bootstrap?.tokenHash ||
      bootstrap.businessSlug !== businessSlug ||
      Number(bootstrap.businessId) !== Number(validBusiness.id)
    ) {
      renderUnavailable('The TerraPeak company does not match this Reservations workspace.')
      return
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: bootstrap.tokenHash,
      type: bootstrap.type || 'email'
    })

    if (error) {
      console.error('Could not establish Reservations session:', error)
      renderUnavailable('Your TerraPeak Reservations session could not be established. Return to the dashboard and try again.')
      return
    }

    completed = true
    window.removeEventListener('message', receiveSession)
    await import('./main.js')
  }

  window.addEventListener('message', receiveSession)
  window.parent.postMessage({ type: 'terrapeak:reservations-ready', businessSlug }, '*')
}

const validBusiness = await validateBusinessRoute()

if (!validBusiness) {
  renderUnavailable()
} else if (isCustomerDashboardView) {
  await startCustomerDashboardView(validBusiness)
} else {
  await import('./main.js')
}
