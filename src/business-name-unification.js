import { supabase } from './supabaseclient.js'

const pathParts = window.location.pathname.split('/').filter(Boolean)
const businessSlug = pathParts[0]

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) {
      resolve(existing)
      return
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector)
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    window.setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

async function getCurrentBusiness() {
  if (!businessSlug) return null

  const { data, error } = await supabase
    .from('businesses')
    .select('id, business_name')
    .eq('business_slug', businessSlug)
    .single()

  if (error) {
    console.error('Could not resolve current business for name unification:', error)
    return null
  }

  return data
}

async function getBusinessProfileName(businessId) {
  const { data, error } = await supabase
    .from('business_profile')
    .select('business_name')
    .eq('business_id', businessId)
    .single()

  if (error) {
    console.error('Could not load business profile name:', error)
    return ''
  }

  return data?.business_name?.trim() || ''
}

function getPageSuffix() {
  const path = window.location.pathname

  if (path.includes('/analytics')) return 'Analytics'
  if (path.includes('/settings')) return 'Settings'
  if (path.includes('/dashboard') || path.includes('/admin')) return 'Dashboard'

  return ''
}

function updatePageHeading(businessName) {
  if (!businessName) return

  const heading = document.querySelector('#app > h1, #app h1')
  const suffix = getPageSuffix()

  if (heading && suffix) {
    heading.textContent = `${businessName} ${suffix}`
  }
}

function hideDuplicateBrandName(businessName) {
  const duplicateNameInput = document.getElementById('restaurantName')
  if (!duplicateNameInput) return

  duplicateNameInput.value = businessName
  duplicateNameInput.type = 'hidden'
  duplicateNameInput.setAttribute('aria-hidden', 'true')

  let sibling = duplicateNameInput.nextSibling
  while (sibling && sibling.nodeName === 'BR') {
    const next = sibling.nextSibling
    sibling.remove()
    sibling = next
  }
}

async function syncBusinessName(businessId, businessName) {
  if (!businessName) return

  const [{ error: brandingError }, { error: businessError }] = await Promise.all([
    supabase
      .from('restaurant_branding')
      .update({ restaurant_name: businessName })
      .eq('business_id', businessId),
    supabase
      .from('businesses')
      .update({ business_name: businessName })
      .eq('id', businessId),
  ])

  if (brandingError) {
    console.error('Could not synchronize branding name:', brandingError)
  }

  if (businessError) {
    console.error('Could not synchronize business list name:', businessError)
  }
}

async function initializeBusinessNameUnification() {
  const business = await getCurrentBusiness()
  if (!business) return

  const businessName = await getBusinessProfileName(business.id)
  if (!businessName) return

  await waitForElement('#app h1')
  updatePageHeading(businessName)

  const businessNameInput = await waitForElement('#businessName', 3000)
  const brandingForm = document.getElementById('brandingForm')

  if (!businessNameInput) return

  hideDuplicateBrandName(businessName)

  businessNameInput.addEventListener('input', () => {
    const nextName = businessNameInput.value.trim()
    const duplicateNameInput = document.getElementById('restaurantName')

    if (duplicateNameInput) {
      duplicateNameInput.value = nextName
    }
  })

  const businessProfileForm = document.getElementById('businessProfileForm')
  businessProfileForm?.addEventListener('submit', async () => {
    const nextName = businessNameInput.value.trim()
    if (!nextName) return

    updatePageHeading(nextName)
    hideDuplicateBrandName(nextName)
    await syncBusinessName(business.id, nextName)
  })

  brandingForm?.addEventListener('submit', () => {
    hideDuplicateBrandName(businessNameInput.value.trim())
  })
}

initializeBusinessNameUnification()
