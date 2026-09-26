import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildClassPackageRpcPayload,
  buildServicePackagePayload,
  resolvePackageOfferingState,
} from '../src/service-package-offering.js'

const migration = await readFile(new URL('../supabase/migrations/20260926100000_explicit_service_package_offering.sql', import.meta.url), 'utf8')
const admin = await readFile(new URL('../src/universal-booking-admin.js', import.meta.url), 'utf8')
const projection = await readFile(new URL('../src/public-booking-data.js', import.meta.url), 'utf8')
const runtime = await readFile(new URL('../src/trusted-management-runtime.js', import.meta.url), 'utf8')

test('explicit service package migration is additive, capability-scoped, and non-transactional', () => {
  assert.match(migration, /add column if not exists offer_as_package boolean not null default false/i)
  assert.match(migration, /comment on column public\.services\.offer_as_package/i)
  assert.match(migration, /capabilities\s+@>\s+'\{"packages": true\}'::jsonb/i)
  assert.match(migration, /price_session_count\s*>\s*1 or service\.package_validity_days is not null/i)
  assert.match(migration, /services_offer_as_package_sessions_check/i)
  assert.doesNotMatch(migration, /create table[^;]*(payment|entitlement|redemption|purchase)/is)
  assert.doesNotMatch(migration, /insert into public\.(bookings|class_enrollments)/i)
})

test('service reads and dashboard writers carry explicit package offering state', () => {
  assert.match(projection, /'offer_as_package'/)
  assert.match(admin, /Offer this service as a package/)
  assert.match(admin, /buildServicePackagePayload\(\{ offerAsPackage/)
  assert.match(admin, /\.\.\.packagePayload, is_published/)
  assert.match(admin, /create_class_service_setup_v3/)
  assert.match(admin, /update_class_service_setup_v3/)
  assert.match(admin, /priceSessionCount: document\.getElementById\('servicePriceSessions'\)\?\.value/)
  assert.match(admin, /service\.booking_type !== 'restaurant'/)
  assert.match(runtime, /create_class_service_setup_v3:'manageServices'/)
  assert.match(runtime, /update_class_service_setup_v3:'manageServices'/)
})

test('class RPC contracts carry the explicit flag without changing enrollment architecture', () => {
  assert.match(migration, /create_class_service_setup_v3[\s\S]*p_offer_as_package boolean/i)
  assert.match(migration, /update_class_service_setup_v3[\s\S]*p_offer_as_package boolean/i)
  assert.doesNotMatch(migration, /create_public_class_enrollment|class_enrollments\s*\(/i)
})

test('migration covers capability-scoped backfill, safe defaults, guards, and RPC security', () => {
  assert.match(migration, /settings\.business_id = service\.business_id/)
  assert.match(migration, /service\.offer_as_package is distinct from true/)
  assert.match(migration, /check \(not offer_as_package or price_session_count >= 2\)/i)
  assert.match(migration, /security definer[\s\S]*set search_path=''/i)
  assert.match(migration, /grant execute on function public\.create_class_service_setup_v3[\s\S]*to authenticated/i)
  assert.match(migration, /grant execute on function public\.update_class_service_setup_v3[\s\S]*to authenticated/i)
  assert.match(migration, /revoke all on function public\.create_class_service_setup_v3[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /revoke all on function public\.update_class_service_setup_v3[\s\S]*from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /grant execute on function public\.(create|update)_class_service_setup_v3[^;]*to anon/i)
})

test('dashboard contract covers create/edit round trips, visibility, Restaurant exclusion, and metadata preservation', () => {
  assert.match(admin, /offerAsPackage = packagesEnabled[\s\S]*serviceOfferAsPackage/)
  assert.match(admin, /buildServicePackagePayload\(\{ offerAsPackage/)
  assert.match(admin, /packageValidityDays: document\.getElementById\('servicePackageValidity'\)\?\.value/)
  assert.match(admin, /\.\.\.packagePayload, is_published/)
  assert.match(admin, /service\.offer_as_package === true \? 'checked'/)
  assert.match(admin, /service\.booking_type !== 'restaurant'/)
  assert.match(admin, /editServiceOfferAsPackage[\s\S]*editServicePackageFields/)
  assert.match(admin, /buildServicePackagePayload\(\{ offerAsPackage, priceSessionCount: document\.getElementById\('editServicePriceSessions'\)\?\.value, packageValidityDays: document\.getElementById\('editServiceValidity'\)\?\.value/)
})

test('public projection remains additive and explicit state is not inferred from metadata', () => {
  assert.match(projection, /price_session_count',\s*'package_validity_days',\s*'offer_as_package'/)
  assert.doesNotMatch(projection, /offer_as_package.*price_session_count/)
})

test('create OFF and ON payloads preserve normal fields and validate session count', () => {
  assert.deepEqual(buildServicePackagePayload({ offerAsPackage: false, priceSessionCount: 1 }), {
    offer_as_package: false, price_session_count: 1, package_validity_days: null,
  })
  assert.deepEqual(buildServicePackagePayload({ offerAsPackage: true, priceSessionCount: 4, packageValidityDays: 30 }), {
    offer_as_package: true, price_session_count: 4, package_validity_days: 30,
  })
  assert.throws(() => buildServicePackagePayload({ offerAsPackage: true, priceSessionCount: 1 }), /at least two sessions/)
  assert.deepEqual(buildServicePackagePayload({ offerAsPackage: true, priceSessionCount: 4, packageValidityDays: null }).package_validity_days, null)
})

test('edit transitions preserve metadata when turning a package off', () => {
  assert.deepEqual(buildServicePackagePayload({ offerAsPackage: true, priceSessionCount: 4, packageValidityDays: 30, preserveMetadataWhenOff: true, existingPriceSessionCount: 1, existingPackageValidityDays: null }), {
    offer_as_package: true, price_session_count: 4, package_validity_days: 30,
  })
  assert.deepEqual(buildServicePackagePayload({ offerAsPackage: false, preserveMetadataWhenOff: true, existingPriceSessionCount: 4, existingPackageValidityDays: 30 }), {
    offer_as_package: false, price_session_count: 4, package_validity_days: 30,
  })
})

test('explicit state controls reload visibility, capability gating, and Restaurant exclusion', () => {
  assert.deepEqual(resolvePackageOfferingState({ packagesEnabled: true, bookingType: 'appointment', offerAsPackage: true }), {
    allowed: true, visible: true, enabled: true, fieldsVisible: true, fieldsEnabled: true,
  })
  assert.deepEqual(resolvePackageOfferingState({ packagesEnabled: true, bookingType: 'appointment', offerAsPackage: false }), {
    allowed: true, visible: true, enabled: false, fieldsVisible: false, fieldsEnabled: false,
  })
  assert.equal(resolvePackageOfferingState({ packagesEnabled: true, bookingType: 'appointment', offerAsPackage: false }).enabled, false)
  assert.equal(resolvePackageOfferingState({ packagesEnabled: false, bookingType: 'appointment', offerAsPackage: true }).visible, false)
  assert.equal(resolvePackageOfferingState({ packagesEnabled: true, bookingType: 'restaurant', offerAsPackage: true }).visible, false)
})

test('class create/edit v3 payloads preserve schedule fields and explicit package state', () => {
  const base = { p_business_id: 37, p_name: 'Class', p_schedule: [{ day_of_week: 1, starts_at: '09:00', ends_at: '10:00', staff_id: 2 }] }
  assert.deepEqual(buildClassPackageRpcPayload({ base, offerAsPackage: true, priceSessionCount: 4, packageValidityDays: 30 }), {
    ...base, p_price_session_count: 4, p_package_validity_days: 30, p_offer_as_package: true,
  })
  assert.deepEqual(buildClassPackageRpcPayload({ base: { p_service_id: 28, p_schedule: base.p_schedule }, offerAsPackage: false, preserveMetadataWhenOff: true, existingPriceSessionCount: 4, existingPackageValidityDays: 30 }), {
    p_service_id: 28, p_schedule: base.p_schedule, p_price_session_count: 4, p_package_validity_days: 30, p_offer_as_package: false,
  })
})
