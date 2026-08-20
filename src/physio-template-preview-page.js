const app = document.querySelector('#app')

document.title = 'TerraPeak Reservations | Physio Settings Preview'
document.body.classList.add('customer-reservations-view')

const fields = [
  { id: 'name', label: 'Full name', type: 'text', required: true, locked: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: true, locked: true },
  { id: 'email', label: 'Email', type: 'email', required: false, locked: false },
  { id: 'first_visit', label: 'Is this your first visit?', type: 'select', required: false, locked: false, options: ['Yes', 'No'] },
  { id: 'reason', label: 'Main reason for appointment', type: 'textarea', required: false, locked: false }
]

const navItems = ['Bookings', 'Services', 'Team & Resources', 'Scheduled', 'Availability', 'Analytics', 'Settings']

app.innerHTML = `
  <main class="reservations-management-shell" style="max-width:1280px;margin:0 auto;">
    <header class="reservations-shell-header">
      <div>
        <p class="reservations-shell-eyebrow">TerraPeak Reservations</p>
        <h1>Settings</h1>
        <p>Physiotherapy template preview</p>
      </div>
    </header>

    <nav class="reservations-shell-nav" aria-label="Reservations">
      ${navItems.map(item => `<a href="#" ${item === 'Settings' ? 'class="active" aria-current="page"' : ''} onclick="event.preventDefault()">${item}</a>`).join('')}
    </nav>

    <section class="reservations-shell-content">
      <div style="display:grid;gap:22px;max-width:1050px;margin:0 auto;">
        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">Business</p><h2>Business profile</h2></div></div>
          <p class="empty-copy">Shared across all reservation templates.</p>
          <form class="stacked-form" onsubmit="event.preventDefault()">
            <label>Business name<input value="Demo Physiotherapy Clinic"></label>
            <div class="form-row">
              <label>Industry template<select><option>Physiotherapy</option><option>Learning Centre</option><option>Dentist</option><option>Restaurant</option></select></label>
              <label>Timezone<select><option>Asia/Kuala_Lumpur</option></select></label>
            </div>
            <div class="form-row">
              <label>Customer label<input value="Patient"></label>
              <label>Booking label<input value="Appointment"></label>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">Branding</p><h2>Customer-facing brand</h2></div></div>
          <p class="empty-copy">Branding remains available regardless of industry.</p>
          <form class="stacked-form" onsubmit="event.preventDefault()">
            <label>Logo<input type="file" disabled><small>Logo upload will use the existing stored branding record when connected.</small></label>
            <div class="form-row">
              <label>Primary colour<input type="color" value="#2f5d50"></label>
              <label>Background colour<input type="color" value="#f7faf9"></label>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">Customer Form</p><h2>Arrange booking fields</h2></div></div>
          <p class="empty-copy">Mandatory system fields cannot be removed or renamed, but they can be moved anywhere. Optional fields can be changed, removed, required/optional, and reordered around mandatory fields.</p>

          <div style="display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:22px;align-items:start;">
            <div>
              <div id="fieldList" class="card-list"></div>
              <div style="border-top:1px solid #e2e8f0;margin-top:18px;padding-top:18px;">
                <h3>Add a field</h3>
                <div class="form-row">
                  <label>Field label<input id="newFieldLabel" placeholder="Gender"></label>
                  <label>Field type<select id="newFieldType"><option value="text">Text</option><option value="textarea">Long text</option><option value="select">Dropdown</option><option value="date">Date</option><option value="checkbox">Checkbox</option></select></label>
                </div>
                <label class="check-label"><input id="newFieldRequired" type="checkbox"> Required</label>
                <button id="addField" type="button">Add field</button>
              </div>
            </div>

            <aside style="position:sticky;top:18px;border-left:1px solid #e2e8f0;padding-left:22px;">
              <p class="eyebrow">Live preview</p>
              <h3>Appointment request form</h3>
              <p class="empty-copy">Assume the patient already selected the service, practitioner and time.</p>
              <form id="customerPreview" class="stacked-form" onsubmit="event.preventDefault()"></form>
            </aside>
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">Booking Flow</p><h2>How requests are handled</h2></div></div>
          <form class="stacked-form" onsubmit="event.preventDefault()">
            <label>Default appointment behaviour<select><option>Confirm immediately when available</option><option>Send as appointment request for staff review</option></select></label>
            <label>Confirmation message<textarea rows="3">Your appointment request has been received.</textarea></label>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">Modules</p><h2>Reservations capabilities</h2></div></div>
          <p class="empty-copy">These control Reservations features, not clinical/CRM functionality.</p>
          <div class="card-list">
            <article class="entity-card"><div><h3>Appointments</h3><small>Practitioner availability and patient booking.</small></div><span class="status published">Enabled</span></article>
            <article class="entity-card"><div><h3>Scheduled</h3><small>Explicit sessions/events when needed.</small></div><span class="status">Optional</span></article>
            <article class="entity-card"><div><h3>Packages</h3><small>Multi-session pricing without treatment-plan CRM.</small></div><span class="status">Optional</span></article>
          </div>
        </section>
      </div>
    </section>
  </main>
`

const fieldList = document.getElementById('fieldList')
const customerPreview = document.getElementById('customerPreview')

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))
}

function renderFieldControl(field, index) {
  const badge = field.locked ? '<span class="status published">Mandatory</span>' : '<span class="status">Customizable</span>'
  const editButtons = field.locked ? '' : `<button type="button" class="link-button edit-field" data-id="${field.id}">Edit</button><button type="button" class="link-button danger-text delete-field" data-id="${field.id}">Delete</button>`
  return `
    <article class="entity-card" style="align-items:center;">
      <div style="min-width:0;flex:1;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><h3 style="margin:0;">${esc(field.label)}</h3>${badge}</div>
        <small>${esc(field.type)}${field.required ? ' · required' : ' · optional'}</small>
      </div>
      <div class="entity-links" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" class="secondary-button move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(field.label)} up">↑</button>
        <button type="button" class="secondary-button move-down" data-index="${index}" ${index === fields.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(field.label)} down">↓</button>
        ${editButtons}
      </div>
    </article>
  `
}

function renderInput(field) {
  const required = field.required ? ' required' : ''
  const mark = field.required ? ' *' : ''
  if (field.type === 'textarea') return `<label>${esc(field.label)}${mark}<textarea rows="3"${required}></textarea></label>`
  if (field.type === 'select') {
    const options = (field.options?.length ? field.options : ['Option 1', 'Option 2']).map(option => `<option>${esc(option)}</option>`).join('')
    return `<label>${esc(field.label)}${mark}<select${required}><option value="">Select</option>${options}</select></label>`
  }
  if (field.type === 'checkbox') return `<label class="check-label"><input type="checkbox"${required}> ${esc(field.label)}${mark}</label>`
  return `<label>${esc(field.label)}${mark}<input type="${esc(field.type)}"${required}></label>`
}

function render() {
  fieldList.innerHTML = fields.map(renderFieldControl).join('')
  customerPreview.innerHTML = fields.map(renderInput).join('') + '<button type="button">Request appointment</button>'
  document.querySelectorAll('.move-up').forEach(button => button.onclick = () => move(Number(button.dataset.index), -1))
  document.querySelectorAll('.move-down').forEach(button => button.onclick = () => move(Number(button.dataset.index), 1))
  document.querySelectorAll('.delete-field').forEach(button => button.onclick = () => removeField(button.dataset.id))
  document.querySelectorAll('.edit-field').forEach(button => button.onclick = () => editField(button.dataset.id))
}

function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= fields.length) return
  ;[fields[index], fields[target]] = [fields[target], fields[index]]
  render()
}

function removeField(id) {
  const index = fields.findIndex(field => field.id === id)
  if (index < 0 || fields[index].locked) return
  fields.splice(index, 1)
  render()
}

function editField(id) {
  const field = fields.find(item => item.id === id)
  if (!field || field.locked) return
  const label = window.prompt('Field label', field.label)
  if (!label?.trim()) return
  field.label = label.trim()
  field.required = window.confirm(`Should "${field.label}" be required?\n\nOK = required, Cancel = optional`)
  render()
}

document.getElementById('addField').onclick = () => {
  const labelInput = document.getElementById('newFieldLabel')
  const typeInput = document.getElementById('newFieldType')
  const requiredInput = document.getElementById('newFieldRequired')
  const label = labelInput.value.trim()
  if (!label) return labelInput.focus()
  fields.push({ id: `custom_${Date.now()}`, label, type: typeInput.value, required: requiredInput.checked, locked: false })
  labelInput.value = ''
  requiredInput.checked = false
  render()
}

render()
