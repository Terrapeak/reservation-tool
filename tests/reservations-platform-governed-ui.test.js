import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveReservationsGovernance, settingsErrorMessage } from '../src/reservation-governance-ui.js'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

const generalCapabilities = {
  services: true,
  teamResources: true,
  scheduledSessions: false,
  packages: false,
  guestCount: false,
}

test('Platform bootstrap fields drive read-only capabilities and stale overrides cannot win', () => {
  const governance = resolveReservationsGovernance({
    templateAuthority: 'platform',
    capabilitiesManagedByPlatform: true,
    effectiveTemplateKey: 'general',
    effectiveTemplateLabel: 'General appointments',
    effectiveCapabilities: { ...generalCapabilities, teamResources: true },
  }, {
    template_key: 'general',
    capabilities: { teamResources: false },
  })

  assert.equal(governance.platformManaged, true)
  assert.equal(governance.effectiveTemplateLabel, 'General appointments')
  assert.equal(governance.effectiveCapabilities.teamResources, true)
  assert.equal(governance.effectiveCapabilities.scheduledSessions, false)
})

test('Platform capability variants and legacy tenants preserve the intended source', () => {
  const physiotherapy = resolveReservationsGovernance({
    templateAuthority: 'platform',
    capabilitiesManagedByPlatform: true,
    effectiveCapabilities: { ...generalCapabilities, packages: true },
    effectiveTemplateLabel: 'Physiotherapy',
  })
  const restaurant = resolveReservationsGovernance({
    templateAuthority: 'platform',
    capabilitiesManagedByPlatform: true,
    effectiveCapabilities: { ...generalCapabilities, guestCount: true },
    effectiveTemplateLabel: 'Restaurant',
  })
  const legacy = resolveReservationsGovernance({}, {
    template_key: 'general',
    capabilities: { services: true, teamResources: false },
  })

  assert.equal(physiotherapy.effectiveCapabilities.packages, true)
  assert.equal(restaurant.effectiveCapabilities.guestCount, true)
  assert.equal(legacy.platformManaged, false)
  assert.equal(legacy.effectiveCapabilities.teamResources, false)
})

test('settings UI renders read-only Platform capabilities and retains legacy editing', async () => {
  const source = await read('../src/restaurant-settings.js')
  assert.match(source, /Controlled by TerraPeak template/)
  assert.match(source, /reservation-capability-status-row/)
  assert.match(source, /governance\.platformManaged\?`<section/)
  assert.match(source, /Save Capabilities/)
  assert.match(source, /const modulesForm=\$\('#modulesForm'\);if\(modulesForm\)/)
  assert.doesNotMatch(source, /\.upsert\(\{business_id:businessId,\.\.\.g,\.\.\.payload\}/)
})

test('booking flow and confirmation saves use minimal payloads and hide governance errors', async () => {
  const source = await read('../src/restaurant-settings.js')
  const errorSource = await read('../src/reservation-governance-ui.js')
  assert.match(source, /upsert\(\{business_id:businessId,\.\.\.payload\}/)
  assert.match(source, /booking_behavior:.*confirmation_message/)
  assert.doesNotMatch(source, /saveGeneral\(\{template_key|saveGeneral\(\{capabilities_managed_by_platform/)
  assert.match(errorSource, /managed by your TerraPeak template/)
  assert.match(errorSource, /reservations capabilities are controlled by the terrapeak template/i)
  const exactTriggerError = 'Reservations capabilities are controlled by the TerraPeak template.'
  assert.equal(settingsErrorMessage(new Error(exactTriggerError)), 'These reservation capabilities are managed by your TerraPeak template.')
  assert.equal(settingsErrorMessage(new Error('permission denied for table reservation_business_settings (SQLSTATE 42501)')), 'permission denied for table reservation_business_settings (SQLSTATE 42501)')
  assert.equal(settingsErrorMessage(new Error('This workflow is governed by another policy.')), 'This workflow is governed by another policy.')
  assert.equal(settingsErrorMessage(new Error('new row violates row-level security policy')), 'new row violates row-level security policy')
})

test('navigation and route gating consume effective bootstrap capabilities', async () => {
  const shell = await read('../src/reservations-management-shell.js')
  const entry = await read('../src/management-entry.js')
  const runtime = await read('../src/trusted-management-runtime.js')
  const bootstrap = await read('../src/customer-auth-bootstrap.js')
  assert.match(shell, /resolveReservationsGovernance\(runtime, settings/)
  assert.match(entry, /resolveReservationsGovernance\(runtime, settings/)
  assert.match(runtime, /effectiveCapabilities/)
  assert.match(bootstrap, /capabilitiesManagedByPlatform/)
  assert.match(bootstrap, /effectiveTemplateLabel/)
})
