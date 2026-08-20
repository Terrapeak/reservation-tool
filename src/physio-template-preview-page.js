const app = document.querySelector('#app')

document.title = 'TerraPeak Reservations | Physio Template Preview'
document.body.classList.add('customer-reservations-view')

const fields = [
  { id: 'name', label: 'Full name', type: 'text', required: true, locked: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: true, locked: true },
  { id: 'email', label: 'Email', type: 'email', required: false, locked: false },
  { id: 'first_visit', label: 'Is this your first visit?', type: 'select', required: false, locked: false, options: ['Yes', 'No'] },
  { id: 'reason', label: 'Main reason for appointment', type: 'textarea', required: false, locked: false }
]

app.innerHTML = `
  <main class="universal-admin" style="max-width:1180px;margin:0 auto;padding:28px 20px 60px;">
    <header class="universal-header" style="margin-bottom:18px;">
      <div>
        <p class="eyebrow">Phase 2 template preview</p>
        <h1>Physiotherapy reservation setup</h1>
        <p>This remains a non-saving preview. We are testing the template and field-ordering approach before connecting it to the live Reservations settings.</p>
      </div>
    </header>

    <section class="panel" style="max-width:900px;margin:0 auto 22px;">
      <div class="panel-heading">
        <div><p class="eyebrow">Service template</p><h2>Create a physiotherapy service</h2></div>
      </div>
      <form class="stacked-form" onsubmit="event.preventDefault()">
        <label>Treatment or service name<input value="Initial physiotherapy assessment"></label>
        <label>Service description <small>(optional)</small><textarea rows="3" placeholder="Optional customer-facing explanation, e.g. First visit assessment for pain, mobility or rehabilitation needs."></textarea></label>
        <div class="form-row">
          <label>Service format<select><option>Appointment</option></select></label>
          <label>Appointment duration (minutes)<input type="number" min="5" value="60"></label>
        </div>
        <label>Appointment scheduling<select><option>Generate from practitioner availability</option><option>Use scheduled sessions</option></select></label>
        <div class="form-row"><label>Booking interval (minutes)<input type="number" min="5" value="30"></label><label>Patients per time slot<input type="number" min="1" value="1"></label></div>
        <div class="form-row"><label>Price<input type="number" min="0" step="0.01" value="120"></label><label>Currency<input value="MYR" maxlength="3"></label></div>
        <div class="form-row"><label>Sessions included in price<input type="number" min="1" value="1"></label><label>Package validity (days, optional)<input type="number" min="1"></label></div>
        <label class="check-label"><input type="checkbox"> Test service</label>
        <label class="check-label"><input type="checkbox"> Publish on the customer page</label>
      </form>
    </section>

    <div style="display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:22px;align-items:start;max-width:1100px;margin:0 auto;">
      <section class="panel">
        <div class="panel-heading"><div><p class="eyebrow">Customer form</p><h2>Arrange booking fields</h2></div></div>
        <p class="empty-copy">Mandatory system fields cannot be deleted or renamed, but they can be moved anywhere in the form. Other fields can be changed or removed.</p>
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
      </section>

      <section class="panel" style="position:sticky;top:18px;">
        <div class="panel-heading"><div><p class="eyebrow">Live preview</p><h2>Customer booking form</h2></div></div>
        <p class="empty-copy">Assume the customer has already chosen the service, practitioner and appointment time.</p>
        <form id="customerPreview" class="stacked-form" onsubmit="event.preventDefault()"></form>
      </section>
    </div>
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
