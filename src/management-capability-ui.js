const runtime = window.__TERRAPEAK_RESERVATIONS_RUNTIME__

if (!runtime || runtime.source !== 'terrapeak-dashboard') {
  throw new Error('Trusted TerraPeak Reservations runtime is required.')
}

const capabilities = runtime.capabilities || {}
const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')

const capabilityForRoute = () => {
  if (route === 'admin/settings') return 'manageSettings'
  if (route === 'admin/services') return 'manageServices'
  if (route === 'admin/staff') return 'manageTeam'
  if (route === 'admin/schedule') return 'manageAvailability'
  if (route === 'admin/availability') {
    return capabilities.manageAvailability ? 'manageAvailability' : 'viewOwnAvailability'
  }
  if (route === 'admin') return 'manageBookings'
  return null
}

function annotateReadOnlyState() {
  const required = capabilityForRoute()
  if (!required || capabilities[required] === true) return

  document.body.dataset.reservationsReadOnly = 'true'

  const content = document.querySelector(
    '#reservationsManagementContent, #universalBookingContent, #app'
  )

  if (content && !content.querySelector('[data-terrapeak-readonly-notice]')) {
    const notice = document.createElement('div')
    notice.dataset.terrapeakReadonlyNotice = 'true'
    notice.className = 'terrapeak-readonly-notice'
    notice.setAttribute('role', 'status')
    notice.textContent = 'Your TerraPeak company role has read-only access to this area.'
    content.prepend(notice)
  }
}

function suppressUnauthorizedControls(root = document) {
  const canManageBookings = capabilities.manageBookings === true
  const canManageSettings = capabilities.manageSettings === true
  const canManageServices = capabilities.manageServices === true
  const canManageTeam = capabilities.manageTeam === true
  const canManageAvailability = capabilities.manageAvailability === true

  const disable = (selector, allowed) => {
    if (allowed) return
    root.querySelectorAll(selector).forEach((element) => {
      if (element.matches('form')) {
        element.querySelectorAll('input, select, textarea, button').forEach((control) => {
          control.disabled = true
        })
      } else if ('disabled' in element) {
        element.disabled = true
      }
    })
  }

  disable('#reservationForm, #adminReservations button, .delete-button, .complete-button, .noshow-button, .archive-button, .restore-button', canManageBookings)
  disable('#businessProfileForm, #operationalSettingsForm, #brandingForm, #logoForm, #customFieldForm, #applyTemplateButton', canManageSettings)
  disable('#serviceForm', canManageServices)
  disable('#staffForm, #assignmentForm', canManageTeam)
  disable('#sessionForm, #editSessionForm, .cancel-session, .cancel-registration', canManageAvailability)
  disable('#exceptionForm, .remove-exception', canManageAvailability)
}

function applyCapabilityUi() {
  annotateReadOnlyState()
  suppressUnauthorizedControls(document)
}

applyCapabilityUi()

const observer = new MutationObserver(() => applyCapabilityUi())
observer.observe(document.documentElement, { childList: true, subtree: true })
