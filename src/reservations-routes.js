const freezeNavigationItem = (item) => Object.freeze(item)

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

const CANONICAL_NAVIGATION_CONTRACT = [
  {
    key: 'bookings',
    label: 'Bookings',
    route: RESERVATIONS_MANAGEMENT_ROUTES.bookings,
    group: 'OPERATIONS',
    order: 10,
    productArea: 'operations',
    requiredCapability: null,
    requiredPermission: null,
    implemented: true,
    renderInReservationTool: true,
    isLanding: true,
    conceptualArea: 'overview',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    route: RESERVATIONS_MANAGEMENT_ROUTES.analytics,
    group: 'INSIGHTS',
    order: 60,
    productArea: 'insights',
    requiredCapability: null,
    requiredPermission: null,
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'services',
    label: 'Services',
    route: RESERVATIONS_MANAGEMENT_ROUTES.services,
    group: 'BOOKING_SETUP',
    order: 20,
    productArea: 'setup',
    requiredCapability: 'services',
    requiredPermission: 'manageServices',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'staff',
    label: 'Team & Resources',
    route: RESERVATIONS_MANAGEMENT_ROUTES.staff,
    group: 'BOOKING_SETUP',
    order: 30,
    productArea: 'setup',
    requiredCapability: 'teamResources',
    requiredPermission: 'manageTeam',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'schedule',
    label: 'Scheduled',
    route: RESERVATIONS_MANAGEMENT_ROUTES.schedule,
    group: 'BOOKING_SETUP',
    order: 40,
    productArea: 'setup',
    requiredCapability: 'scheduledSessions',
    requiredPermission: 'manageScheduledSessions',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'availability',
    label: 'Availability',
    route: RESERVATIONS_MANAGEMENT_ROUTES.availability,
    group: 'BOOKING_SETUP',
    order: 50,
    productArea: 'setup',
    requiredCapability: null,
    requiredPermission: 'manageAvailability',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'customerForm',
    label: 'Customer Form',
    route: RESERVATIONS_MANAGEMENT_ROUTES.customerForm,
    group: 'BOOKING_SETUP',
    order: 70,
    productArea: 'customer-experience',
    requiredCapability: null,
    requiredPermission: 'manageCustomerForm',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'bookingSettings',
    label: 'Settings',
    route: RESERVATIONS_MANAGEMENT_ROUTES.settings,
    group: 'BOOKING_SETUP',
    order: 80,
    productArea: 'setup',
    requiredCapability: null,
    requiredPermission: 'manageSettings',
    implemented: true,
    renderInReservationTool: true,
  },
  {
    key: 'callbackRequests',
    label: 'Callback Requests',
    route: '/dashboard/reservations/callback-requests',
    group: 'OPERATIONS',
    order: 15,
    productArea: 'operations',
    requiredCapability: null,
    requiredPermission: 'manageCallbackRequests',
    implemented: false,
    renderInReservationTool: false,
    ownership: 'dashboard_compatibility',
  },
  {
    key: 'preview',
    label: 'Preview',
    route: '/dashboard/reservations/preview',
    group: 'BOOKING_PAGE',
    order: 90,
    productArea: 'customer-experience',
    requiredCapability: null,
    requiredPermission: null,
    implemented: false,
    renderInReservationTool: false,
    ownership: 'dashboard_compatibility',
  },
  {
    key: 'shareEmbed',
    label: 'Share & Embed',
    route: '/dashboard/reservations/integrate',
    group: 'BOOKING_PAGE',
    order: 100,
    productArea: 'channel',
    requiredCapability: null,
    requiredPermission: 'manageIntegrations',
    implemented: false,
    renderInReservationTool: false,
    ownership: 'dashboard_compatibility',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    route: RESERVATIONS_MANAGEMENT_ROUTES.settings,
    group: 'BOOKING_SETUP',
    order: 85,
    productArea: 'setup',
    requiredCapability: null,
    requiredPermission: 'manageSettings',
    implemented: false,
    renderInReservationTool: false,
    ownership: 'settings_subsection',
  },
].map(freezeNavigationItem)

export const RESERVATIONS_NAVIGATION_CONTRACT = Object.freeze(
  CANONICAL_NAVIGATION_CONTRACT,
)

export const getReservationsNavigation = ({
  capabilities = {},
  includeCompatibility = false,
} = {}) => RESERVATIONS_NAVIGATION_CONTRACT
  .filter(item => includeCompatibility || item.renderInReservationTool)
  .filter(item => item.implemented || includeCompatibility)
  .filter(item => !item.requiredCapability || capabilities[item.requiredCapability] !== false)
  .sort((a, b) => a.order - b.order)

export const RESERVATIONS_NAVIGATION = Object.freeze(
  getReservationsNavigation().map(({ key, label, route, group, order, productArea, requiredCapability, isLanding, conceptualArea }) =>
    freezeNavigationItem({ key, label, route, group, order, productArea, requiredCapability, isLanding, conceptualArea }),
  ),
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
