import { supabase } from './supabaseclient.js'

const pathParts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = pathParts[0]
const route = pathParts.slice(1).join('/')
const supportedRoutes = new Set([
  'admin/services',
  'dashboard/services',
  'admin/staff',
  'dashboard/staff',
  'admin/schedule',
  'dashboard/schedule',
  'admin/availability',
  'dashboard/availability'
])

if (businessSlug && supportedRoutes.has(route)) {
  startUniversalBookingAdmin()
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function money(value, currency = 'MYR') {
  if (value === null || value === undefined || value === '') return 'Price not set'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency
  }).format(Number(value))
}

function showMessage(message, type = 'success') {
  const element = document.getElementById('universalBookingMessage')
  if (!element) return
  element.className = `universal-message ${type}`
  element.textContent = message
}

function renderShell(business, activePage) {
  const base = `/${business.business_slug}/dashboard`
  document.querySelector('#app').innerHTML = `
    <main class="universal-admin">
      <header class="universal-header">
        <div>
          <p class="eyebrow">Universal booking</p>
          <h1>${escapeHtml(business.business_name)}</h1>
        </div>
        <a class="secondary-button" href="${base}">Back to reservations</a>
      </header>

      <nav class="universal-nav" aria-label="Universal booking settings">
        <a class="${activePage === 'services' ? 'active' : ''}" href="${base}/services">Services</a>
        <a class="${activePage === 'staff' ? 'active' : ''}" href="${base}/staff">Staff</a>
        <a class="${activePage === 'schedule' ? 'active' : ''}" href="${base}/schedule">Schedule</a>
        <a class="${activePage === 'availability' ? 'active' : ''}" href="${base}/availability">Availability</a>
      </nav>

      <div id="universalBookingMessage" role="status" aria-live="polite"></div>
      <section id="universalBookingContent" class="universal-content"></section>
    </main>
  `
}

async function loadBusiness() {
  const { data, error } = await supabase.rpc('get_public_booking_business', {
    p_business_slug: businessSlug
  })

  if (error) throw error
  if (!data?.[0]) throw new Error('Booking business not found.')
  return data[0]
}

async function requireBusinessAccess(business) {
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session

  if (!session) {
    renderSignIn(business)
    return null
  }

  const { data, error } = await supabase
    .from('business_memberships')
    .select('role')
    .eq('business_id', business.id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) {
    document.getElementById('universalBookingContent').innerHTML = `
      <div class="empty-state">
        <h2>Access is not assigned</h2>
        <p>Your account is signed in but is not a member of this business.</p>
        <button type="button" id="signOutButton" class="secondary-button">Sign out</button>
      </div>
    `
    document.getElementById('signOutButton').addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.reload()
    })
    return null
  }

  return { session, role: data.role }
}

function renderSignIn(business) {
  document.getElementById('universalBookingContent').innerHTML = `
    <div class="auth-card">
      <h2>Sign in to manage ${escapeHtml(business.business_name)}</h2>
      <p>Use the owner, manager or staff account assigned to this business.</p>
      <form id="universalSignInForm" class="stacked-form">
        <label>Email<input id="signInEmail" type="email" autocomplete="email" required></label>
        <label>Password<input id="signInPassword" type="password" autocomplete="current-password" required></label>
        <button type="submit">Sign in</button>
      </form>
    </div>
  `

  document.getElementById('universalSignInForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.currentTarget.querySelector('button')
    button.disabled = true
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('signInEmail').value.trim(),
      password: document.getElementById('signInPassword').value
    })
    if (error) {
      showMessage(error.message, 'error')
      button.disabled = false
      return
    }
    window.location.reload()
  })
}

async function startUniversalBookingAdmin() {
  try {
    const business = await loadBusiness()
    const activePage = route.split('/').at(-1)
    renderShell(business, activePage)
    const access = await requireBusinessAccess(business)
    if (!access) return

    if (activePage === 'services') await renderServices(business, access)
    if (activePage === 'staff') await renderStaff(business, access)
    if (activePage === 'schedule') await renderSchedule(business, access)
    if (activePage === 'availability') await renderAvailability(business, access)
  } catch (error) {
    console.error(error)
    document.querySelector('#app').innerHTML = `
      <main class="universal-admin">
        <div class="empty-state">
          <h1>Universal booking is not ready</h1>
          <p>${escapeHtml(error.message || 'The booking configuration could not be loaded.')}</p>
        </div>
      </main>
    `
  }
}

async function renderServices(business, access) {
  const canManage = ['owner', 'manager'].includes(access.role)
  const { data: services, error } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', business.id)
    .order('name')
  if (error) throw error

  document.getElementById('universalBookingContent').innerHTML = `
    <div class="universal-grid">
      <section class="panel">
        <div class="panel-heading"><div><p class="eyebrow">Offerings</p><h2>Services</h2></div><span>${services.length}</span></div>
        <div class="card-list">
          ${services.length ? services.map(service => `
            <article class="entity-card">
              <div>
                <h3>${escapeHtml(service.name)}</h3>
                <p>${escapeHtml(service.booking_type)} · ${service.duration_minutes} minutes · ${money(service.price, service.currency)}</p>
                <small>${service.scheduling_mode === 'scheduled' ? 'Owner-scheduled sessions' : 'Generated from staff availability'}</small>
              </div>
              <span class="status ${service.is_published ? 'published' : ''}">${service.is_published ? 'Published' : 'Draft'}</span>
            </article>
          `).join('') : '<p class="empty-copy">No services have been created yet.</p>'}
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">New offering</p>
        <h2>Create a service</h2>
        ${canManage ? `
          <form id="serviceForm" class="stacked-form">
            <label>Service name<input id="serviceName" required placeholder="Sports massage"></label>
            <label>Description<textarea id="serviceDescription" rows="3"></textarea></label>
            <div class="form-row">
              <label>Type<select id="serviceType"><option value="appointment">Appointment</option><option value="class">Class</option><option value="course">Course</option><option value="restaurant">Restaurant</option></select></label>
              <label>Duration<input id="serviceDuration" type="number" min="5" value="60" required></label>
            </div>
            <label>Scheduling method<select id="serviceSchedulingMode"><option value="generated">Generate appointments from staff availability</option><option value="scheduled">Use owner-scheduled classes or sessions</option></select></label>
            <div class="form-row">
              <label>Slot interval<input id="slotInterval" type="number" min="5" value="30" required></label>
              <label>Capacity<input id="serviceCapacity" type="number" min="1" value="1" required></label>
            </div>
            <div class="form-row">
              <label>Price<input id="servicePrice" type="number" min="0" step="0.01"></label>
              <label>Currency<input id="serviceCurrency" maxlength="3" value="MYR" required></label>
            </div>
            <label class="check-label"><input id="servicePublished" type="checkbox"> Publish on the customer page</label>
            <button type="submit">Create service</button>
          </form>
        ` : '<p>Only owners and managers can create services.</p>'}
      </section>
    </div>
  `

  document.getElementById('serviceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const name = document.getElementById('serviceName').value.trim()
    const payload = {
      business_id: business.id,
      name,
      slug: toSlug(name),
      description: document.getElementById('serviceDescription').value.trim() || null,
      booking_type: document.getElementById('serviceType').value,
      scheduling_mode: document.getElementById('serviceSchedulingMode').value,
      duration_minutes: Number(document.getElementById('serviceDuration').value),
      slot_interval_minutes: Number(document.getElementById('slotInterval').value),
      capacity: Number(document.getElementById('serviceCapacity').value),
      price: document.getElementById('servicePrice').value || null,
      currency: document.getElementById('serviceCurrency').value.toUpperCase(),
      is_published: document.getElementById('servicePublished').checked
    }
    const { error } = await supabase.from('services').insert(payload)
    if (error) return showMessage(error.message, 'error')
    showMessage(`${name} was created.`)
    await renderServices(business, access)
  })
}

async function renderSchedule(business, access) {
  const canManage = ['owner', 'manager'].includes(access.role)
  const [{ data: services, error: servicesError }, { data: staff, error: staffError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from('services').select('id, name, duration_minutes, capacity, scheduling_mode').eq('business_id', business.id).eq('is_active', true).eq('scheduling_mode', 'scheduled').order('name'),
    supabase.from('staff_members').select('id, display_name, user_id, timezone').eq('business_id', business.id).eq('is_active', true).order('display_name'),
    supabase.from('staff_services').select('staff_id, service_id').eq('is_active', true)
  ])
  if (servicesError) throw servicesError
  if (staffError) throw staffError
  if (assignmentsError) throw assignmentsError

  const visibleStaffIds = canManage ? null : new Set(staff.filter(person => person.user_id === access.session.user.id).map(person => person.id))
  let sessionQuery = supabase.from('scheduled_sessions')
    .select('id, service_id, staff_id, starts_at, ends_at, capacity, status, is_published, notes')
    .eq('business_id', business.id).gte('ends_at', new Date().toISOString()).order('starts_at').limit(100)
  if (!canManage && visibleStaffIds?.size === 1) sessionQuery = sessionQuery.eq('staff_id', [...visibleStaffIds][0])
  const { data: sessions, error: sessionsError } = await sessionQuery
  if (sessionsError) throw sessionsError

  const serviceMap = Object.fromEntries(services.map(service => [service.id, service]))
  const staffMap = Object.fromEntries(staff.map(person => [person.id, person]))
  const scheduled = sessions.filter(session => session.status === 'scheduled')

  document.getElementById('universalBookingContent').innerHTML = `
    <div class="schedule-layout">
      <section class="panel">
        <div class="panel-heading"><div><p class="eyebrow">Owner calendar</p><h2>Upcoming sessions</h2></div><span>${scheduled.length}</span></div>
        <div class="calendar-summary">
          ${scheduled.length ? scheduled.map(session => `
            <article class="calendar-item session-item">
              <div>
                <strong>${escapeHtml(serviceMap[session.service_id]?.name || 'Session')}</strong>
                <span>${new Date(session.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} – ${new Date(session.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <small>${escapeHtml(staffMap[session.staff_id]?.display_name || 'Unassigned')} · Capacity ${session.capacity} · ${session.is_published ? 'Published' : 'Draft'}</small>
              </div>
              ${canManage ? `<button type="button" class="danger-text cancel-session" data-id="${session.id}">Cancel</button>` : ''}
            </article>
          `).join('') : '<p>No upcoming sessions have been scheduled.</p>'}
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">New calendar entry</p><h2>Schedule a session</h2>
        ${canManage && services.length && staff.length ? `
          <form id="sessionForm" class="stacked-form">
            <label>Service<select id="sessionService">${services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')}</select></label>
            <label>Teacher or staff member<select id="sessionStaff"></select></label>
            <div class="form-row"><label>Date<input id="sessionDate" type="date" required></label><label>Start time<input id="sessionTime" type="time" required></label></div>
            <div class="form-row"><label>Duration in minutes<input id="sessionDuration" type="number" min="5" required></label><label>Capacity<input id="sessionCapacity" type="number" min="1" required></label></div>
            <label>Repeat<select id="sessionRepeat"><option value="1">This date only</option><option value="4">Weekly for 4 weeks</option><option value="8">Weekly for 8 weeks</option><option value="12">Weekly for 12 weeks</option></select></label>
            <label>Internal or customer note<input id="sessionNotes" maxlength="1000" placeholder="Bring workbook 2"></label>
            <label class="check-label"><input id="sessionPublished" type="checkbox" checked> Publish for customer booking</label>
            <button type="submit">Add to calendar</button>
          </form>
        ` : canManage ? '<p>Create a scheduled service and assign at least one staff member before adding sessions.</p>' : '<p>Your calendar is read-only. Owners and managers create the schedule.</p>'}
      </section>
    </div>
  `

  const serviceSelect = document.getElementById('sessionService')
  function refreshSessionForm() {
    if (!serviceSelect) return
    const serviceId = Number(serviceSelect.value)
    const service = serviceMap[serviceId]
    const eligibleIds = new Set(assignments.filter(item => item.service_id === serviceId).map(item => item.staff_id))
    const staffSelect = document.getElementById('sessionStaff')
    staffSelect.innerHTML = staff.filter(person => eligibleIds.has(person.id)).map(person => `<option value="${person.id}">${escapeHtml(person.display_name)} (${escapeHtml(person.timezone)})</option>`).join('')
    document.getElementById('sessionDuration').value = service?.duration_minutes || 60
    document.getElementById('sessionCapacity').value = service?.capacity || 1
  }
  serviceSelect?.addEventListener('change', refreshSessionForm)
  refreshSessionForm()

  document.getElementById('sessionForm')?.addEventListener('submit', async event => {
    event.preventDefault()
    if (!document.getElementById('sessionStaff').value) return showMessage('Assign a staff member to this service first.', 'error')
    const button = event.currentTarget.querySelector('button[type="submit"]')
    button.disabled = true
    const { data, error } = await supabase.rpc('create_scheduled_sessions', {
      p_business_id: business.id,
      p_service_id: Number(serviceSelect.value),
      p_staff_id: Number(document.getElementById('sessionStaff').value),
      p_local_starts_at: `${document.getElementById('sessionDate').value}T${document.getElementById('sessionTime').value}:00`,
      p_duration_minutes: Number(document.getElementById('sessionDuration').value),
      p_capacity: Number(document.getElementById('sessionCapacity').value),
      p_repeat_weeks: Number(document.getElementById('sessionRepeat').value),
      p_is_published: document.getElementById('sessionPublished').checked,
      p_notes: document.getElementById('sessionNotes').value.trim() || null
    })
    button.disabled = false
    if (error) return showMessage(error.message, 'error')
    showMessage(`${data?.[0]?.sessions_created || 1} session${data?.[0]?.sessions_created === 1 ? '' : 's'} added to the calendar.`)
    await renderSchedule(business, access)
  })

  document.querySelectorAll('.cancel-session').forEach(button => button.addEventListener('click', async () => {
    const { error } = await supabase.rpc('cancel_scheduled_session', { p_session_id: Number(button.dataset.id) })
    if (error) return showMessage(error.message, 'error')
    showMessage('Session cancelled.')
    await renderSchedule(business, access)
  }))
}

async function renderStaff(business, access) {
  const canManage = ['owner', 'manager'].includes(access.role)
  const [{ data: staff, error: staffError }, { data: services, error: servicesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from('staff_members').select('*').eq('business_id', business.id).order('display_name'),
    supabase.from('services').select('id, name').eq('business_id', business.id).eq('is_active', true).order('name'),
    supabase.from('staff_services').select('staff_id, service_id, custom_duration_minutes, custom_price, services(name)').eq('is_active', true)
  ])
  if (staffError) throw staffError
  if (servicesError) throw servicesError
  if (assignmentsError) throw assignmentsError

  const assignmentsByStaff = assignments.reduce((grouped, assignment) => {
    grouped[assignment.staff_id] ||= []
    grouped[assignment.staff_id].push(assignment)
    return grouped
  }, {})

  document.getElementById('universalBookingContent').innerHTML = `
    <div class="universal-grid">
      <section class="panel">
        <div class="panel-heading"><div><p class="eyebrow">People</p><h2>Staff</h2></div><span>${staff.length}</span></div>
        <div class="card-list">
          ${staff.length ? staff.map(person => `
            <article class="entity-card staff-card">
              <div>
                <h3>${escapeHtml(person.display_name)}</h3>
                <p>${(assignmentsByStaff[person.id] || []).map(item => escapeHtml(item.services?.name)).join(', ') || 'No services assigned'}</p>
              </div>
              <span class="status ${person.is_published ? 'published' : ''}">${person.is_published ? 'Published' : 'Draft'}</span>
            </article>
          `).join('') : '<p class="empty-copy">No staff members have been created yet.</p>'}
        </div>
      </section>

      <div class="panel-stack">
        <section class="panel">
          <p class="eyebrow">New team member</p><h2>Create staff</h2>
          ${canManage ? `
            <form id="staffForm" class="stacked-form">
              <label>Display name<input id="staffName" required placeholder="Jane Tan"></label>
              <label>Biography<textarea id="staffBio" rows="3"></textarea></label>
              <label>Timezone<input id="staffTimezone" value="Asia/Kuala_Lumpur" required></label>
              <label class="check-label"><input id="staffPublished" type="checkbox"> Publish staff profile</label>
              <button type="submit">Create staff member</button>
            </form>
          ` : '<p>Only owners and managers can create staff.</p>'}
        </section>

        <section class="panel">
          <p class="eyebrow">Capabilities</p><h2>Assign a service</h2>
          ${canManage && staff.length && services.length ? `
            <form id="assignmentForm" class="stacked-form">
              <label>Staff<select id="assignmentStaff">${staff.map(person => `<option value="${person.id}">${escapeHtml(person.display_name)}</option>`).join('')}</select></label>
              <label>Service<select id="assignmentService">${services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')}</select></label>
              <div class="form-row"><label>Custom duration<input id="assignmentDuration" type="number" min="5" placeholder="Use service default"></label><label>Custom price<input id="assignmentPrice" type="number" min="0" step="0.01"></label></div>
              <button type="submit">Assign service</button>
            </form>
          ` : '<p>Create at least one service and staff member before assigning capabilities.</p>'}
        </section>
      </div>
    </div>
  `

  document.getElementById('staffForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const displayName = document.getElementById('staffName').value.trim()
    const { error } = await supabase.from('staff_members').insert({
      business_id: business.id,
      display_name: displayName,
      slug: toSlug(displayName),
      bio: document.getElementById('staffBio').value.trim() || null,
      timezone: document.getElementById('staffTimezone').value.trim(),
      is_published: document.getElementById('staffPublished').checked
    })
    if (error) return showMessage(error.message, 'error')
    showMessage(`${displayName} was added.`)
    await renderStaff(business, access)
  })

  document.getElementById('assignmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const { error } = await supabase.from('staff_services').upsert({
      staff_id: Number(document.getElementById('assignmentStaff').value),
      service_id: Number(document.getElementById('assignmentService').value),
      custom_duration_minutes: document.getElementById('assignmentDuration').value || null,
      custom_price: document.getElementById('assignmentPrice').value || null,
      is_active: true
    })
    if (error) return showMessage(error.message, 'error')
    showMessage('Service assignment saved.')
    await renderStaff(business, access)
  })
}

async function renderAvailability(business, access) {
  const [{ data: staff, error: staffError }, { data: services, error: servicesError }] = await Promise.all([
    supabase.from('staff_members').select('id, display_name, user_id, timezone').eq('business_id', business.id).eq('is_active', true).order('display_name'),
    supabase.from('services').select('id, name').eq('business_id', business.id).eq('is_active', true).order('name')
  ])
  if (staffError) throw staffError
  if (servicesError) throw servicesError

  const manageableStaff = ['owner', 'manager'].includes(access.role)
    ? staff
    : staff.filter(person => person.user_id === access.session.user.id)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  document.getElementById('universalBookingContent').innerHTML = `
    <div class="universal-grid">
      <section class="panel">
        <p class="eyebrow">Weekly hours</p><h2>Recurring availability</h2>
        ${manageableStaff.length ? `
          <form id="availabilityForm" class="stacked-form">
            <label>Staff<select id="availabilityStaff">${manageableStaff.map(person => `<option value="${person.id}">${escapeHtml(person.display_name)}</option>`).join('')}</select></label>
            <label>Service restriction<select id="availabilityService"><option value="">All assigned services</option>${services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')}</select></label>
            <div class="weekly-grid">
              ${days.map((day, index) => `<div class="day-row availability-day"><label class="check-label"><input class="day-enabled" data-day="${index}" type="checkbox" ${index > 0 && index < 6 ? 'checked' : ''}>${day}</label><div class="day-periods" data-day="${index}"><div class="period-row"><input class="period-start" type="time" value="09:00" aria-label="${day} start time"><span>to</span><input class="period-end" type="time" value="17:00" aria-label="${day} end time"><button type="button" class="remove-period" aria-label="Remove time period">Remove</button></div><button type="button" class="add-period" data-day="${index}">+ Add time period</button></div></div>`).join('')}
            </div>
            <button type="submit">Replace weekly schedule</button>
          </form>
        ` : '<p>No staff calendar is available for this account.</p>'}
      </section>

      <section class="panel">
        <p class="eyebrow">Exceptions</p><h2>Day off or special hours</h2>
        ${manageableStaff.length ? `
          <form id="exceptionForm" class="stacked-form">
            <label>Staff<select id="exceptionStaff">${manageableStaff.map(person => `<option value="${person.id}">${escapeHtml(person.display_name)}</option>`).join('')}</select></label>
            <label>Service restriction<select id="exceptionService"><option value="">All assigned services</option>${services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')}</select></label>
            <label>Type<select id="exceptionType"><option value="unavailable">Unavailable / day off</option><option value="available">Additional availability</option></select></label>
            <label>Starts<input id="exceptionStart" type="datetime-local" required></label>
            <label>Ends<input id="exceptionEnd" type="datetime-local" required></label>
            <label>Reason<input id="exceptionReason" placeholder="Annual leave"></label>
            <button type="submit">Add exception</button>
          </form>
          <div id="exceptionList" class="calendar-summary"></div>
        ` : ''}
      </section>
    </div>
  `

  function wirePeriodRow(row) {
    row.querySelector('.remove-period').addEventListener('click', () => {
      const container = row.closest('.day-periods')
      if (container.querySelectorAll('.period-row').length === 1) {
        const checkbox = document.querySelector(`.day-enabled[data-day="${container.dataset.day}"]`)
        checkbox.checked = false
        return
      }
      row.remove()
    })
  }

  function appendPeriod(container, start = '09:00', end = '17:00') {
    const row = document.createElement('div')
    row.className = 'period-row'
    row.innerHTML = `<input class="period-start" type="time" value="${start.slice(0, 5)}" aria-label="Start time"><span>to</span><input class="period-end" type="time" value="${end.slice(0, 5)}" aria-label="End time"><button type="button" class="remove-period" aria-label="Remove time period">Remove</button>`
    container.insertBefore(row, container.querySelector('.add-period'))
    wirePeriodRow(row)
    return row
  }

  document.querySelectorAll('.period-row').forEach(wirePeriodRow)
  document.querySelectorAll('.add-period').forEach(button => {
    button.addEventListener('click', () => {
      const container = document.querySelector(`.day-periods[data-day="${button.dataset.day}"]`)
      const row = appendPeriod(container)
      document.querySelector(`.day-enabled[data-day="${button.dataset.day}"]`).checked = true
      row.querySelector('.period-start').focus()
    })
  })

  async function loadWeeklySchedule() {
    const staffId = Number(document.getElementById('availabilityStaff')?.value)
    if (!staffId) return
    const serviceValue = document.getElementById('availabilityService').value
    let query = supabase.from('availability_rules').select('day_of_week, start_time, end_time')
      .eq('staff_id', staffId).eq('is_active', true).order('start_time')
    query = serviceValue ? query.eq('service_id', Number(serviceValue)) : query.is('service_id', null)
    const { data: savedRules, error } = await query
    if (error) return showMessage(error.message, 'error')
    days.forEach((day, dayIndex) => {
      const container = document.querySelector(`.day-periods[data-day="${dayIndex}"]`)
      container.querySelectorAll('.period-row').forEach(row => row.remove())
      const periods = savedRules.filter(rule => rule.day_of_week === dayIndex)
      document.querySelector(`.day-enabled[data-day="${dayIndex}"]`).checked = periods.length > 0
      if (periods.length) periods.forEach(period => appendPeriod(container, period.start_time, period.end_time))
      else appendPeriod(container)
    })
  }

  document.getElementById('availabilityStaff')?.addEventListener('change', loadWeeklySchedule)
  document.getElementById('availabilityService')?.addEventListener('change', loadWeeklySchedule)

  document.getElementById('availabilityForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const staffId = Number(document.getElementById('availabilityStaff').value)
    const serviceValue = document.getElementById('availabilityService').value
    const serviceId = serviceValue ? Number(serviceValue) : null

    const rules = [...document.querySelectorAll('.day-enabled:checked')].flatMap(checkbox => {
      const day = Number(checkbox.dataset.day)
      return [...document.querySelectorAll(`.day-periods[data-day="${day}"] .period-row`)].map(row => ({
        business_id: business.id,
        staff_id: staffId,
        service_id: serviceId,
        day_of_week: day,
        start_time: row.querySelector('.period-start').value,
        end_time: row.querySelector('.period-end').value
      }))
    })
    const invalidRule = rules.find(rule => !rule.start_time || !rule.end_time || rule.end_time <= rule.start_time)
    if (invalidRule) return showMessage(`${days[invalidRule.day_of_week]} has an end time that is not later than its start time.`, 'error')

    let deleteQuery = supabase.from('availability_rules').delete().eq('staff_id', staffId)
    deleteQuery = serviceId === null ? deleteQuery.is('service_id', null) : deleteQuery.eq('service_id', serviceId)
    const { error: deleteError } = await deleteQuery
    if (deleteError) return showMessage(deleteError.message, 'error')
    if (rules.length) {
      const { error } = await supabase.from('availability_rules').insert(rules)
      if (error) return showMessage(error.message, 'error')
    }
    showMessage('Weekly availability saved.')
    await loadWeeklySchedule()
  })

  document.getElementById('exceptionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const { error } = await supabase.from('availability_exceptions').insert({
      business_id: business.id,
      staff_id: Number(document.getElementById('exceptionStaff').value),
      service_id: document.getElementById('exceptionService').value ? Number(document.getElementById('exceptionService').value) : null,
      exception_type: document.getElementById('exceptionType').value,
      starts_at: new Date(document.getElementById('exceptionStart').value).toISOString(),
      ends_at: new Date(document.getElementById('exceptionEnd').value).toISOString(),
      reason: document.getElementById('exceptionReason').value.trim() || null
    })
    if (error) return showMessage(error.message, 'error')
    event.currentTarget.reset()
    showMessage('Calendar exception added.')
    await loadExceptions()
  })

  async function loadExceptions() {
    const staffId = Number(document.getElementById('exceptionStaff')?.value)
    if (!staffId) return
    const { data: exceptions, error } = await supabase.from('availability_exceptions')
      .select('id, service_id, starts_at, ends_at, exception_type, reason')
      .eq('staff_id', staffId).gte('ends_at', new Date().toISOString()).order('starts_at').limit(30)
    if (error) return showMessage(error.message, 'error')
    const target = document.getElementById('exceptionList')
    target.innerHTML = '<h3>Upcoming exceptions</h3>' + (exceptions.length ? exceptions.map(item => {
      const service = services.find(entry => entry.id === item.service_id)
      return `<div class="calendar-item"><div><strong>${item.exception_type === 'unavailable' ? 'Time off' : 'Special hours'}</strong><span>${new Date(item.starts_at).toLocaleString()} – ${new Date(item.ends_at).toLocaleString()}</span><small>${escapeHtml(service?.name || 'All services')}${item.reason ? ' · ' + escapeHtml(item.reason) : ''}</small></div><button type="button" class="danger-text remove-exception" data-id="${item.id}">Remove</button></div>`
    }).join('') : '<p>No upcoming exceptions.</p>')
    target.querySelectorAll('.remove-exception').forEach(button => button.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('availability_exceptions').delete().eq('id', Number(button.dataset.id))
      if (deleteError) return showMessage(deleteError.message, 'error')
      showMessage('Calendar exception removed.')
      await loadExceptions()
    }))
  }

  document.getElementById('exceptionStaff')?.addEventListener('change', loadExceptions)
  await loadWeeklySchedule()
  await loadExceptions()
}
