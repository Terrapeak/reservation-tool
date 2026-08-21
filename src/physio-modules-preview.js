function installPhysioModulesPreview() {
  const sections = [...document.querySelectorAll('.panel')]
  const modulesSection = sections.find(section => section.querySelector('.eyebrow')?.textContent.trim() === 'Modules')
  if (!modulesSection || modulesSection.dataset.modulesRefined === '1') return

  modulesSection.dataset.modulesRefined = '1'
  modulesSection.innerHTML = `
    <div class="panel-heading"><div><p class="eyebrow">Modules</p><h2>Reservations capabilities</h2></div></div>
    <p class="empty-copy">Turn on only the booking capabilities this clinic needs. These do not add CRM or clinical-record functions.</p>
    <div class="card-list">
      <article class="entity-card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;">
        <div>
          <h3 style="margin-bottom:4px;">Appointments</h3>
          <small>Core Physio flow: the patient selects a service, Reservations finds therapists qualified for it, checks their availability, and offers matching appointment times.</small>
        </div>
        <label style="display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:600;">
          <input type="checkbox" checked disabled>
          Enabled
        </label>
      </article>

      <article class="entity-card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;">
        <div>
          <h3 style="margin-bottom:4px;">Scheduled sessions</h3>
          <small>Enable fixed-date sessions or events that are published at specific times instead of being generated from normal therapist availability, such as a Saturday posture workshop or group rehabilitation session.</small>
        </div>
        <label style="display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:600;">
          <input id="scheduledModuleToggle" type="checkbox">
          <span id="scheduledModuleState">Disabled</span>
        </label>
      </article>

      <article class="entity-card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;">
        <div>
          <h3 style="margin-bottom:4px;">Packages</h3>
          <small>Enable services sold as multiple sessions under one price, for example a 5-session rehabilitation package. This does not create treatment plans or clinical records.</small>
        </div>
        <label style="display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:600;">
          <input id="packagesModuleToggle" type="checkbox">
          <span id="packagesModuleState">Disabled</span>
        </label>
      </article>
    </div>
  `

  const scheduled = document.getElementById('scheduledModuleToggle')
  const packages = document.getElementById('packagesModuleToggle')
  scheduled?.addEventListener('change', () => {
    document.getElementById('scheduledModuleState').textContent = scheduled.checked ? 'Enabled' : 'Disabled'
  })
  packages?.addEventListener('change', () => {
    document.getElementById('packagesModuleState').textContent = packages.checked ? 'Enabled' : 'Disabled'
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installPhysioModulesPreview)
} else {
  installPhysioModulesPreview()
}

const observer = new MutationObserver(installPhysioModulesPreview)
observer.observe(document.documentElement, { childList: true, subtree: true })
window.setTimeout(() => observer.disconnect(), 10000)
