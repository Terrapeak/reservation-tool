import { supabase } from './supabaseclient.js'

const route = window.location.pathname.split('/').filter(Boolean)
const businessSlug = route[0]?.toLowerCase() === 'book' ? route[1] : null

if (businessSlug) installBookingFlowWording()

async function installBookingFlowWording() {
  const { data: businesses = [] } = await supabase.rpc('get_public_booking_business', { p_business_slug: businessSlug })
  const business = businesses?.[0]
  if (!business?.id) return

  const { data: settings } = await supabase
    .from('reservation_business_settings')
    .select('booking_behavior,confirmation_message')
    .eq('business_id', business.id)
    .maybeSingle()

  const requestMode = settings?.booking_behavior === 'request'
  if (!requestMode && !settings?.confirmation_message) return

  function apply() {
    const form = document.querySelector('#publicBookingForm')
    if (!form) return

    // Restaurant reservations and scheduled/class bookings retain their own established flows.
    const restaurant = document.querySelector('.booking-kicker')?.textContent?.trim().toLowerCase() === 'restaurant'
    const scheduled = document.querySelector('.booking-kicker')?.textContent?.trim().toLowerCase().startsWith('scheduled')
    if (restaurant || scheduled) return

    const submit = form.querySelector('button.booking-confirm[type="submit"]')
    if (submit && !submit.disabled) submit.textContent = requestMode ? 'Request appointment' : 'Confirm booking'

    const message = form.querySelector('#bookingMessage')
    if (message && requestMode && message.textContent === 'Confirming…') message.textContent = 'Sending appointment request…'

    const success = form.querySelector('.booking-success')
    if (!success || success.dataset.flowWordingApplied === '1') return
    success.dataset.flowWordingApplied = '1'

    if (requestMode) {
      const kicker = success.querySelector('.booking-kicker')
      if (kicker) kicker.textContent = 'Appointment request received'
      const paragraphs = [...success.querySelectorAll('p')]
      const referenceParagraph = paragraphs.find(p => p.querySelector('strong'))
      const reference = referenceParagraph?.querySelector('strong')?.textContent || ''
      const custom = settings?.confirmation_message?.trim()
      const explanatory = document.createElement('p')
      explanatory.textContent = custom || 'Your requested time is being held. The clinic will contact you to confirm the appointment.'
      const heading = success.querySelector('h2')
      if (heading) heading.insertAdjacentElement('afterend', explanatory)
      if (referenceParagraph && reference) referenceParagraph.innerHTML = `Your request reference is <strong>${escapeHtml(reference)}</strong>.`
      const emailNote = paragraphs.find(p => p.textContent.includes('Email confirmation'))
      if (emailNote) emailNote.textContent = 'Please save this reference while you wait for the clinic to confirm your appointment.'
    } else if (settings?.confirmation_message?.trim()) {
      const custom = document.createElement('p')
      custom.textContent = settings.confirmation_message.trim()
      const heading = success.querySelector('h2')
      if (heading) heading.insertAdjacentElement('afterend', custom)
    }
  }

  apply()
  const observer = new MutationObserver(apply)
  observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true, characterData: true })
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
