import { resolveJourneyConfiguration } from './reservation-journey.js'

const GOVERNED_CAPABILITY_KEYS = Object.freeze(['services', 'teamResources', 'scheduledSessions', 'packages', 'guestCount'])

function copyCapabilities(value = {}) {
  return Object.fromEntries(GOVERNED_CAPABILITY_KEYS.map(key => [key, value[key] === true]))
}

function isPlatformGoverned(runtime = {}) {
  const marker = runtime.capabilitiesManagedByPlatform === true
  const authority = String(runtime.templateAuthority || '').toLowerCase() === 'platform'
  if (marker && runtime.templateAuthority && !authority) return false
  return marker || authority
}

export function resolveReservationsGovernance(runtime = {}, settings = {}, business = {}) {
  const platformManaged = isPlatformGoverned(runtime)
  const fallback = resolveJourneyConfiguration(settings, business)
  const effectiveCapabilities = platformManaged && runtime.effectiveCapabilities
    ? copyCapabilities(runtime.effectiveCapabilities)
    : copyCapabilities(fallback.capabilities)
  const effectiveTemplateKey = String(runtime.effectiveTemplateKey || fallback.templateKey || 'general')
  const effectiveTemplateLabel = String(runtime.effectiveTemplateLabel || effectiveTemplateKey || 'your reservation template')
  return {
    platformManaged,
    templateAuthority: platformManaged ? 'platform' : 'legacy',
    capabilitiesManagedByPlatform: platformManaged,
    effectiveTemplateKey,
    effectiveTemplateLabel,
    effectiveCapabilities,
    effectiveTerminology: platformManaged && runtime.effectiveTerminology
      ? { ...runtime.effectiveTerminology }
      : { ...(fallback.terminology || {}) },
  }
}

export function settingsErrorMessage(error) {
  const message = String(error?.message || error || '')
  if (/reservations capabilities are controlled by the terrapeak template/i.test(message)) return 'These reservation capabilities are managed by your TerraPeak template.'
  return message || 'Reservations settings could not be saved.'
}
