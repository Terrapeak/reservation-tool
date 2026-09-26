export function resolvePackageOfferingState({
  packagesEnabled = false,
  bookingType = '',
  offerAsPackage = false,
} = {}) {
  const allowed = packagesEnabled === true && bookingType !== 'restaurant'
  const enabled = allowed && offerAsPackage === true
  return {
    allowed,
    visible: allowed,
    enabled,
    fieldsVisible: enabled,
    fieldsEnabled: enabled,
  }
}

export function buildServicePackagePayload({
  offerAsPackage = false,
  priceSessionCount = 1,
  packageValidityDays = null,
  preserveMetadataWhenOff = false,
  existingPriceSessionCount = 1,
  existingPackageValidityDays = null,
} = {}) {
  const enabled = offerAsPackage === true
  const sessionCount = enabled
    ? Number(priceSessionCount)
    : preserveMetadataWhenOff ? Number(existingPriceSessionCount || 1) : 1
  if (enabled && (!Number.isInteger(sessionCount) || sessionCount < 2)) {
    throw new Error('Package offerings must cover at least two sessions.')
  }
  return {
    offer_as_package: enabled,
    price_session_count: sessionCount,
    package_validity_days: enabled
      ? (packageValidityDays || null)
      : preserveMetadataWhenOff ? (existingPackageValidityDays || null) : null,
  }
}

export function buildClassPackageRpcPayload({
  base = {},
  offerAsPackage = false,
  priceSessionCount = 1,
  packageValidityDays = null,
  preserveMetadataWhenOff = false,
  existingPriceSessionCount = 1,
  existingPackageValidityDays = null,
} = {}) {
  const packagePayload = buildServicePackagePayload({
    offerAsPackage,
    priceSessionCount,
    packageValidityDays,
    preserveMetadataWhenOff,
    existingPriceSessionCount,
    existingPackageValidityDays,
  })
  return {
    ...base,
    p_price_session_count: packagePayload.price_session_count,
    p_package_validity_days: packagePayload.package_validity_days,
    p_offer_as_package: packagePayload.offer_as_package,
  }
}
