const app = document.querySelector('#app')

document.title = 'TerraPeak Reservations | Physio Template Preview'

document.body.classList.add('customer-reservations-view')

app.innerHTML = `
  <main class="universal-admin" style="max-width:1100px;margin:0 auto;padding:28px 20px 60px;">
    <header class="universal-header" style="margin-bottom:18px;">
      <div>
        <p class="eyebrow">Phase 1 template preview</p>
        <h1>Physiotherapy service setup</h1>
        <p>This is a standalone visual preview. It does not save data and does not change the current Learning Centre setup.</p>
      </div>
    </header>

    <section class="panel" style="max-width:860px;margin:0 auto;">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">New offering</p>
          <h2>Create a physiotherapy service</h2>
        </div>
      </div>

      <div class="template-preview-note" style="margin-bottom:18px;padding:14px 16px;border:1px solid #d9e2ec;border-radius:10px;background:#f8fafc;display:grid;gap:4px;">
        <strong>Physiotherapy template</strong>
        <span>Practitioners remain managed in Team & Resources. Appointment times continue to use the existing Availability engine.</span>
      </div>

      <form class="stacked-form" onsubmit="event.preventDefault()">
        <label>Treatment or service name<input value="Initial physiotherapy assessment" placeholder="Sports massage"></label>
        <label>Customer-facing description<textarea rows="3" placeholder="Describe what the patient is booking.">Initial assessment for pain, mobility or rehabilitation needs.</textarea></label>

        <div class="form-row">
          <label>Service format<select><option>Appointment</option></select></label>
          <label>Appointment duration (minutes)<input type="number" min="5" value="60"></label>
        </div>

        <label>Appointment scheduling<select><option>Generate from practitioner availability</option><option>Use scheduled sessions</option></select></label>

        <div class="form-row">
          <label>Booking interval (minutes)<input type="number" min="5" value="30"></label>
          <label>Patients per time slot<input type="number" min="1" value="1"></label>
        </div>

        <div class="form-row">
          <label>Price<input type="number" min="0" step="0.01" value="120"></label>
          <label>Currency<input value="MYR" maxlength="3"></label>
        </div>

        <div class="form-row">
          <label>Sessions included in price<input type="number" min="1" value="1"></label>
          <label>Package validity (days, optional)<input type="number" min="1"></label>
        </div>

        <label class="check-label"><input type="checkbox"> Test service <small>Use for trial bookings. Test services can later be deleted together with their test history.</small></label>
        <label class="check-label"><input type="checkbox"> Publish on the customer page</label>

        <button type="button">Create service</button>
      </form>
    </section>

    <section class="panel" style="max-width:860px;margin:22px auto 0;">
      <p class="eyebrow">For this review</p>
      <h2>What to evaluate</h2>
      <p>Focus only on whether these fields and labels make sense for a physiotherapy business. Practitioner selection, customer form ordering, branding and the final booking flow come in later phases.</p>
    </section>
  </main>
`
