const canonicalizeDashboardRoute = () => {
  const { pathname, search, hash } = window.location

  if (!pathname.includes('/admin')) {
    return
  }

  const dashboardPath = pathname.replace('/admin', '/dashboard')
  window.history.replaceState({}, '', `${dashboardPath}${search}${hash}`)
}

canonicalizeDashboardRoute()
