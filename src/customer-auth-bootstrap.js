import { supabase } from './supabaseclient.js'

const searchParams = new URLSearchParams(window.location.search)
const isCustomerDashboardView = searchParams.get('customerView') === '1'

if (isCustomerDashboardView) {
  const originalPrompt = window.prompt.bind(window)

  window.prompt = (message, defaultValue) => {
    if (message === 'Enter admin password:') {
      return import.meta.env.VITE_ADMIN_PASSWORD || ''
    }

    if (message === 'Enter manager delete password:') {
      return import.meta.env.VITE_DELETE_PASSWORD || ''
    }

    return originalPrompt(message, defaultValue)
  }
}

const pathParts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = pathParts[0] || ''
const reservedSegments = new Set(['admin', 'dashboard', 'analytics', 'settings', 'services', 'staff', 'schedule', 'availability', 'book', 'onboarding'])

async function validateBusinessRoute() {
  if (!businessSlug || reservedSegments.has(businessSlug.toLowerCase())) {
    return false
  }

  const { data, error } = await supabase.rpc('get_public_booking_business', {
    p_business_slug: businessSlug
  })

  if (error) {
    console.error('Could not validate Reservations tenant:', error)
    return false
  }

  return Array.isArray(data) ? data.length > 0 : Boolean(data)
}

const validBusinessRoute = await validateBusinessRoute()

if (!validBusinessRoute) {
  document.querySelector('#app').innerHTML = `
    <main class="auth-card">
      <h1>Reservations workspace not found</h1>
      <p>This Reservations workspace is not configured or the link is invalid.</p>
      <a href="https://dashboard.terrapeakgroup.com/dashboard">Return to TerraPeak Dashboard</a>
    </main>
  `
} else {
  await import('./main.js')
}
