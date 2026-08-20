const route = window.location.pathname.split('/').filter(Boolean).slice(1).join('/')

if (route === 'admin/services' || route === 'dashboard/services') {
  const observer = new MutationObserver(() => installTemplatePreview())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  installTemplatePreview()
}

function labelFor(id) {
  return document.getElementById(id)?.closest('label') || null
}

function labelText(label) {
  if (!label) return ''
  const node = [...label.childNodes].find(item => item.nodeType === Node.TEXT_NODE && item.textContent.trim())
  return node?.textContent.trim() || ''
}

function setLabelText(label, text) {
  if (!label) return
  const node = [...label.childNodes].find(item => item.nodeType === Node.TEXT_NODE && item.textContent.trim())
  if (node) node.textContent = text
}

function installTemplatePreview() {
  const form = document.getElementById('serviceForm')
  if (!form || form.dataset.templatePreviewReady === 'true') return

  form.dataset.templatePreviewReady = 'true'

  const panel = form.closest('.panel')
  const heading = panel?.querySelector('h2')
  const serviceType = document.getElementById('serviceType')
  const subjectLabel = document.getElementById('serviceSubjectLabel')
  const cohortSetup = document.getElementById('cohortSetup')

  if (!panel || !heading || !serviceType || !subjectLabel || !cohortSetup) return

  const labels = {
    name: labelFor('serviceName'),
    description: labelFor('serviceDescription'),
    type: labelFor('serviceType'),
    duration: labelFor('serviceDuration'),
    scheduling: labelFor('serviceSchedulingMode'),
    interval: labelFor('slotInterval'),
    capacity: labelFor('serviceCapacity'),
    price: labelFor('servicePrice'),
    currency: labelFor('serviceCurrency'),
    sessions: labelFor('servicePriceSessions'),
    validity: labelFor('servicePackageValidity')
  }

  const original = {
    heading: heading.textContent,
    typeValue: serviceType.value,
    labels: Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, labelText(label)]))
  }

  const chooser = document.createElement('div')
  chooser.className = 'template-preview-control'
  chooser.innerHTML = `
    <label>
      Template preview
      <select id="serviceTemplatePreview">
        <option value="current">Current Learning Centre form</option>
        <option value="physio">Physiotherapy</option>
      </select>
    </label>
    <p class="form-help">Phase 1 preview only. Switching templates changes the form presentation; the existing Reservations booking engine remains unchanged.</p>
  `
  form.prepend(chooser)

  const physioNote = document.createElement('div')
  physioNote.id = 'physioTemplateNote'
  physioNote.className = 'template-preview-note'
  physioNote.hidden = true
  physioNote.innerHTML = `
    <strong>Physiotherapy service</strong>
    <span>Practitioners continue to come from Team & Resources, while appointment times continue to use the existing Availability engine.</span>
  `
  chooser.insertAdjacentElement('afterend', physioNote)

  const selector = document.getElementById('serviceTemplatePreview')
  selector.addEventListener('change', () => {
    if (selector.value === 'physio') applyPhysio()
    else restoreCurrent()
  })

  function applyPhysio() {
    heading.textContent = 'Create a physiotherapy service'
    physioNote.hidden = false

    serviceType.value = 'appointment'
    serviceType.dispatchEvent(new Event('change', { bubbles: true }))

    subjectLabel.hidden = true
    cohortSetup.hidden = true

    setLabelText(labels.name, 'Treatment or service name')
    setLabelText(labels.description, 'Customer-facing description')
    setLabelText(labels.type, 'Service format')
    setLabelText(labels.duration, 'Appointment duration (minutes)')
    setLabelText(labels.scheduling, 'Appointment scheduling')
    setLabelText(labels.interval, 'Booking interval (minutes)')
    setLabelText(labels.capacity, 'Patients per time slot')
    setLabelText(labels.price, 'Price')
    setLabelText(labels.currency, 'Currency')
    setLabelText(labels.sessions, 'Sessions included in price')
    setLabelText(labels.validity, 'Package validity (days, optional)')

    const appointmentOption = [...serviceType.options].find(option => option.value === 'appointment')
    if (appointmentOption) appointmentOption.textContent = 'Appointment'
  }

  function restoreCurrent() {
    heading.textContent = original.heading
    physioNote.hidden = true

    Object.entries(labels).forEach(([key, label]) => setLabelText(label, original.labels[key]))
    serviceType.value = original.typeValue
    serviceType.dispatchEvent(new Event('change', { bubbles: true }))
  }
}
