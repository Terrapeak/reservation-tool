function formatDate(date) {
  return date.toISOString().split('T')[0]
}

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
      subtree: true
    })

    window.setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

function setActivePreset(container, activeButton) {
  container.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button === activeButton)
  })
}

async function enhanceAnalyticsPage() {
  const analyticsResults = await waitForElement('#analyticsResults')
  if (!analyticsResults) return

  const startInput = document.getElementById('analyticsStartDate')
  const endInput = document.getElementById('analyticsEndDate')
  const loadButton = document.getElementById('loadAnalyticsButton')

  if (!startInput || !endInput || !loadButton) return

  const startLabel = startInput.previousElementSibling
  const endLabel = endInput.previousElementSibling

  const panel = document.createElement('section')
  panel.className = 'analytics-filter-panel'

  const heading = document.createElement('label')
  heading.textContent = 'Date range'

  const presets = document.createElement('div')
  presets.className = 'date-range-presets'

  const customFields = document.createElement('div')
  customFields.className = 'custom-date-fields'

  const startField = document.createElement('div')
  const endField = document.createElement('div')

  if (startLabel) startField.appendChild(startLabel)
  startField.appendChild(startInput)

  if (endLabel) endField.appendChild(endLabel)
  endField.appendChild(endInput)

  customFields.append(startField, endField)
  panel.append(heading, presets, customFields, loadButton)

  const nav = document.querySelector('.admin-nav')
  nav?.insertAdjacentElement('afterend', panel)

  document.querySelectorAll('br').forEach((br) => {
    if (!br.parentElement || br.closest('.analytics-filter-panel')) return
    if (br.previousElementSibling === startInput || br.previousElementSibling === endInput) {
      br.remove()
    }
  })

  const today = new Date()

  const options = [
    { label: '7 days', days: 7 },
    { label: '14 days', days: 14 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: 'All time', allTime: true },
    { label: 'Custom', custom: true }
  ]

  options.forEach((option) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = option.label

    button.addEventListener('click', () => {
      setActivePreset(presets, button)

      if (option.custom) {
        customFields.classList.add('visible')
        return
      }

      customFields.classList.remove('visible')
      endInput.value = formatDate(today)

      if (option.allTime) {
        startInput.value = '2000-01-01'
      } else {
        const startDate = new Date(today)
        startDate.setDate(today.getDate() - (option.days - 1))
        startInput.value = formatDate(startDate)
      }

      loadButton.click()
    })

    presets.appendChild(button)
  })

  const defaultButton = presets.querySelector('button:nth-child(3)')
  defaultButton?.click()
}

function setSettingsTabColors() {
  const settingsSection = document.getElementById('businessSettingsSection')
  if (!settingsSection) return

  const buttons = document.querySelectorAll('.settings-tabs button')
  const observer = new MutationObserver(() => {
    buttons.forEach((button) => {
      button.setAttribute('aria-selected', String(button.classList.contains('active')))
    })
  })

  buttons.forEach((button) => {
    observer.observe(button, { attributes: true, attributeFilter: ['class'] })
  })
}

function startEnhancements() {
  enhanceAnalyticsPage()
  waitForElement('#businessSettingsSection').then(setSettingsTabColors)
}

startEnhancements()
