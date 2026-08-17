export function bookingDateTimeParts(value, timeZone = 'UTC') {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.valueOf())) return { bookingDate: '', bookingTime: '' }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    bookingDate: `${values.year}-${values.month}-${values.day}`,
    bookingTime: `${values.hour}:${values.minute}`
  }
}
