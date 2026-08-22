import { supabase } from './supabaseclient.js'

const parts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = parts[0]?.toLowerCase() === 'book' ? parts[1] : null

const LABELS = {
  physiotherapy: 'Physiotherapy',
  dental: 'Dental',
  salon: 'Salon / beauty',
  learning_centre: 'Learning centre',
  general: 'Appointment',
  restaurant: 'Restaurant',
}

if (businessSlug) installPresentation()

async function installPresentation() {
  const { data: rows = [] } = await supabase.rpc('get_public_booking_business', {
    p_business_slug: businessSlug,
  })
  const business = rows?.[0]
  if (!business?.id) return

  const type = String(business.business_type || 'general').toLowerCase()
  if (type === 'restaurant') return
  const label = LABELS[type] || LABELS.general

  let runs = 0
  const timer = window.setInterval(() => {
    runs += 1
    apply(label)
    if (runs >= 40) window.clearInterval(timer)
  }, 250)

  apply(label)
}

function apply(label) {
  document.querySelectorAll('.booking-type, .booking-kicker').forEach(node => {
    if (node.textContent.trim().toLowerCase() === 'restaurant') node.textContent = label
  })

  document.querySelectorAll('.slot small').forEach(node => {
    if (/guest(s)? available/i.test(node.textContent)) node.textContent = 'Available'
  })
}
