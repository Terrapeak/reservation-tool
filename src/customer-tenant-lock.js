const searchParams = new URLSearchParams(window.location.search)
const isCustomerView = searchParams.get('customerView') === '1'

if (isCustomerView) {
  const lockedBusinessSlug = window.location.pathname.split('/').filter(Boolean)[0]

  const secureCustomerView = () => {
    const businessSwitcher = document.getElementById('businessSwitcher')

    if (businessSwitcher) {
      businessSwitcher.remove()
    }

    document.querySelectorAll('.admin-nav a').forEach((link) => {
      const url = new URL(link.href, window.location.origin)
      const pathParts = url.pathname.split('/').filter(Boolean)

      if (pathParts.length > 0) {
        pathParts[0] = lockedBusinessSlug
        url.pathname = `/${pathParts.join('/')}`
      }

      url.searchParams.set('customerView', '1')
      link.href = `${url.pathname}${url.search}${url.hash}`
    })
  }

  const observer = new MutationObserver(secureCustomerView)

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  secureCustomerView()
}
