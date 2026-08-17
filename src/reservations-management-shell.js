const managementRoutes = new Set([
  'admin',
  'dashboard',
  'admin/analytics',
  'dashboard/analytics',
  'admin/settings',
  'dashboard/settings',
  'admin/services',
  'dashboard/services',
  'admin/staff',
  'dashboard/staff',
  'admin/schedule',
  'dashboard/schedule',
  'admin/availability',
  'dashboard/availability'
])

const pathParts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = pathParts[0] || ''
const rawRoute = pathParts.slice(1).join('/')
const isCustomerView = new URLSearchParams(window.location.search).get('customerView') === '1'

if (businessSlug && isCustomerView && managementRoutes.has(rawRoute)) {
  installUnifiedManagementShell()
}

function canonicalRoute(route) {
  if (route.startsWith('admin')) {
    return route.replace(/^admin/, 'dashboard')
  }
  return route || 'dashboard'
}

function routeLabel(route) {
  const canonical = canonicalRoute(route)
  if (canonical.endsWith('/services')) return 'Services'
  if (canonical.endsWith('/staff')) return 'Team & Resources'
  if (canonical.endsWith('/schedule')) return 'Schedule'
  if (canonical.endsWith('/availability')) return 'Availability'
  if (canonical.endsWith('/analytics')) return 'Analytics'
  if (canonical.endsWith('/settings')) return 'Settings'
  return 'Bookings'
}

function customerManagementHref(path) {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('customerView', '1')
  return `${url.pathname}${url.search}`
}

function buildNavigation(activeRoute) {
  const base = `/${businessSlug}/dashboard`
  const links = [
    ['Bookings', base],
    ['Services', `${base}/services`],
    ['Team & Resources', `${base}/staff`],
    ['Availability', `${base}/availability`],
    ['Analytics', `${base}/analytics`],
    ['Settings', `${base}/settings`]
  ]

  return links.map(([label, path]) => {
    const hrefRoute = path.split('/').slice(2).join('/') || 'dashboard'
    const active = canonicalRoute(activeRoute) === hrefRoute
    const href = customerManagementHref(path)
    return `<a href="${href}" ${active ? 'class="active" aria-current="page"' : ''}>${label}</a>`
  }).join('')
}

function findBusinessName(root) {
  const trustedHeading = root.querySelector('.universal-header h1, h1')
  if (!trustedHeading) return 'Reservations'

  return trustedHeading.textContent
    .replace(/\s+Admin Dashboard$/i, '')
    .replace(/\s+Dashboard$/i, '')
    .replace(/\s+Reservations$/i, '')
    .trim() || 'Reservations'
}

function extractPageContent(root) {
  const universal = root.querySelector('.universal-admin')
  if (universal) {
    const message = universal.querySelector('#universalBookingMessage')
    const content = universal.querySelector('#universalBookingContent')
    const fragment = document.createDocumentFragment()
    if (message) fragment.appendChild(message)
    if (content) fragment.appendChild(content)
    return fragment
  }

  root.querySelectorAll('.admin-nav, #businessSwitcher').forEach((element) => element.remove())

  const fragment = document.createDocumentFragment()
  while (root.firstChild) {
    fragment.appendChild(root.firstChild)
  }
  return fragment
}

function renderUnifiedShell(root) {
  if (root.dataset.unifiedReservationsShell === '1') return true

  const hasLegacyAdmin = root.querySelector('.admin-nav, #adminReservations, #businessSettingsSection, #analyticsResults')
  const hasUniversalAdmin = root.querySelector('.universal-admin')
  if (!hasLegacyAdmin && !hasUniversalAdmin) return false

  const businessName = findBusinessName(root)
  const pageTitle = routeLabel(rawRoute)
  const content = extractPageContent(root)

  const shell = document.createElement('main')
  shell.className = 'reservations-management-shell'
  shell.innerHTML = `
    <header class="reservations-shell-header">
      <div>
        <p class="reservations-shell-eyebrow">TerraPeak Reservations</p>
        <h1>${businessName}</h1>
        <p>${pageTitle}</p>
      </div>
    </header>
    <nav class="reservations-shell-nav" aria-label="Reservations">
      ${buildNavigation(rawRoute)}
    </nav>
    <section class="reservations-shell-content" data-reservations-content></section>
  `

  shell.querySelector('[data-reservations-content]').appendChild(content)
  root.replaceChildren(shell)
  root.dataset.unifiedReservationsShell = '1'
  document.body.classList.add('unified-reservations-management')
  document.title = `${businessName} | TerraPeak Reservations`
  return true
}

function installUnifiedManagementShell() {
  const root = document.querySelector('#app')
  if (!root) return

  if (renderUnifiedShell(root)) return

  const observer = new MutationObserver(() => {
    if (renderUnifiedShell(root)) observer.disconnect()
  })

  observer.observe(root, { childList: true, subtree: true })

  window.setTimeout(() => observer.disconnect(), 15000)
}
