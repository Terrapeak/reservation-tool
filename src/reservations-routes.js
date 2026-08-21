export const RESERVATIONS_MANAGEMENT_ROUTES = Object.freeze({
  bookings: 'admin',
  analytics: 'admin/analytics',
  settings: 'admin/settings',
  customerForm: 'admin/customer-form',
  services: 'admin/services',
  staff: 'admin/staff',
  schedule: 'admin/schedule',
  availability: 'admin/availability',
})

export const RESERVATIONS_MANAGEMENT_ROUTE_SET = new Set(
  Object.values(RESERVATIONS_MANAGEMENT_ROUTES),
)

export const RESERVATIONS_ROUTE_GROUPS = Object.freeze({
  unifiedBookings: new Set([
    RESERVATIONS_MANAGEMENT_ROUTES.bookings,
    RESERVATIONS_MANAGEMENT_ROUTES.analytics,
  ]),
  settings: new Set([RESERVATIONS_MANAGEMENT_ROUTES.settings]),
  customerForm: new Set([RESERVATIONS_MANAGEMENT_ROUTES.customerForm]),
  universal: new Set([
    RESERVATIONS_MANAGEMENT_ROUTES.services,
    RESERVATIONS_MANAGEMENT_ROUTES.staff,
    RESERVATIONS_MANAGEMENT_ROUTES.schedule,
    RESERVATIONS_MANAGEMENT_ROUTES.availability,
  ]),
})
