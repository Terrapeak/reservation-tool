import { supabase } from './supabaseclient.js'

const parts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = parts[0]?.toLowerCase() === 'book' ? parts[1] : null

const SUPPORTED_TYPES = new Set([
  'physiotherapy',
  'dental',
  'salon',
  'learning_centre',
  'general',
  'restaurant',
])

if (businessSlug) installPresentation()

async function installPresentation() {
  const { data: rows = [] } = await supabase.rpc('get_public_booking_business', {
    p_business_slug: businessSlug,
  })
  const business = rows?.[0]
  if (!business?.id) return

  const rawType = String(business.business_type || 'general').toLowerCase()
  const type = SUPPORTED_TYPES.has(rawType) ? rawType : 'general'

  document.body.classList.add(`booking-business-${type}`)
}
