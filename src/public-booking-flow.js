import { supabase } from './supabaseclient.js'

const route = window.location.pathname.split('/').filter(Boolean)
const businessSlug = route[0]?.toLowerCase() === 'book' ? route[1] : null

if (businessSlug) installBookingFlowWording()

const TYPE_WORDING = {
  physiotherapy: { label: 'Physiotherapy', confirm: 'Your physiotherapy appointment has been reserved.' },
  dental: { label: 'Dental', confirm: 'Your dental appointment has been reserved.' },
  salon: { label: 'Salon / beauty', confirm: 'Your appointment has been reserved.' },
  learning_centre: { label: 'Learning centre', confirm: 'Your place has been reserved.' },
  restaurant: { label: 'Restaurant', confirm: null },
  general: { label: 'Appointment', confirm: 'Your appointment has been reserved.' },
}

async function installBookingFlowWording() {
  const { data: businesses = [] } = await supabase.rpc('get_public_booking_business', { p_business_slug: businessSlug })
  const business = businesses?.[0]
  if (!business?.id) return

  const type = String(business.business_type || 'general').toLowerCase()
  const wording = TYPE_WORDING[type] || TYPE_WORDING.general
  const isRestaurantBusiness = type === 'restaurant'

  const { data: settings } = await supabase
    .from('reservation_business_settings')
    .select('booking_behavior,confirmation_message')
    .eq('business_id', business.id)
    .maybeSingle()

  const requestMode = settings?.booking_behavior === 'request'

  function apply() {
    if (!isRestaurantBusiness) {
  document.querySelectorAll('.slot small').forEach(small => {
    if (/guest(s)? available/i.test(small.textContent) && small.textContent !== 'Available') {
      small.textContent = 'Available'
    }
  })
}

    const form = document.querySelector('#publicBookingForm')
    if (!form) return

    if (!isRestaurantBusiness) {
      const quantity = form.elements?.quantity
      const quantityLabel = quantity?.closest('label')
      if (quantity && quantity.value !== '1') quantity.value = '1'
      if (quantityLabel && !quantityLabel.hidden) quantityLabel.hidden = true

      const notes = form.elements?.notes
      const notesLabel = notes?.closest('label')
      if (notesLabel && !notesLabel.hidden) notesLabel.hidden = true

      const submit = form.querySelector('button.booking-confirm[type="submit"]')
      const submitLabel = requestMode ? 'Request appointment' : 'Confirm booking'
      // Guard text writes: MutationObserver watches characterData, so repeatedly assigning
      // the same text can create a self-sustaining mutation loop and starve async slot loading.
      if (submit && !submit.disabled && submit.textContent !== submitLabel) submit.textContent = submitLabel
    }

    const message = form.querySelector('#bookingMessage')
    if (message && requestMode && message.textContent === 'Confirming…') message.textContent = 'Sending appointment request…'

    const success = form.querySelector('.booking-success')
    if (!success || success.dataset.flowWordingApplied === '1') return
    success.dataset.flowWordingApplied = '1'

    const paragraphs = [...success.querySelectorAll('p')]
    const referenceParagraph = paragraphs.find(p => p.querySelector('strong'))
    const reference = referenceParagraph?.querySelector('strong')?.textContent || ''
    const heading = success.querySelector('h2')

    if (!isRestaurantBusiness) {
      const successKicker = success.querySelector('.booking-kicker')
      const successLabel = requestMode ? 'Appointment request received' : 'Booking confirmed'
      if (successKicker && successKicker.textContent !== successLabel) successKicker.textContent = successLabel
      const restaurantConfirmation = paragraphs.find(p => /your table for .* has been reserved/i.test(p.textContent))
      if (restaurantConfirmation && restaurantConfirmation.textContent !== wording.confirm) restaurantConfirmation.textContent = wording.confirm
    }

    if (requestMode) {
      const custom = settings?.confirmation_message?.trim()
      const explanatory = document.createElement('p')
      explanatory.textContent = custom || 'Your requested time is being held. The business will contact you to confirm the appointment.'
      if (heading) heading.insertAdjacentElement('afterend', explanatory)
      if (referenceParagraph && reference) referenceParagraph.innerHTML = `Your request reference is <strong>${escapeHtml(reference)}</strong>.`
      const emailNote = paragraphs.find(p => p.textContent.includes('Email confirmation'))
      if (emailNote) emailNote.textContent = 'Please save this reference while you wait for confirmation.'
    } else if (settings?.confirmation_message?.trim()) {
      const custom = document.createElement('p')
      custom.textContent = settings.confirmation_message.trim()
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
