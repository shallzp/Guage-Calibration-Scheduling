export function parseDate(dateString) {
  const parts = String(dateString || '').split('/').map(Number)
  const day = parts[0]
  const month = parts[1]
  const year = parts[2] || new Date().getFullYear()
  if (!day || !month || !year) return null
  return new Date(year, month - 1, day)
}

export function parseDateAny(value) {
  if (!value || value === '-' || value === 'Not Available') return null
  const text = String(value).trim()
  if (!text) return null
  if (text.includes('/')) return parseDate(text)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseDayMonthYear(dateText) {
  if (!dateText) return { year: '', month: '' }
  const [day, month, year] = String(dateText).split('/')
  if (!day || !month || !year) return { year: '', month: '' }
  return {
    year: year.trim(),
    month: String(Number(month.trim())),
  }
}

export function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}



export function formatDisplayDate(value, fallback = '-') {
  const parsed = parseDateAny(value)
  if (!parsed) return fallback
  return formatDate(parsed)
}

export function toDateSortValue(value) {
  const parsed = parseDateAny(value)
  return parsed ? parsed.getTime() : 0
}

export function addHours(date, hours) {
  const nextDate = new Date(date)
  nextDate.setTime(nextDate.getTime() + hours * 60 * 60 * 1000)
  return nextDate
}

export function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const h = date.getHours()
  const period = h >= 12 ? 'PM' : 'AM'
  const hours12 = String(h % 12 || 12).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours12}:${minutes} ${period}`
}

export function addMonthsClamped(date, months) {
  const nextDate = new Date(date)
  const day = nextDate.getDate()
  nextDate.setDate(1)
  nextDate.setMonth(nextDate.getMonth() + months)
  const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
  nextDate.setDate(Math.min(day, lastDay))
  return nextDate
}

export function inputDateToDisplayDate(inputDate) {
  const [year, month, day] = String(inputDate || '').split('-')
  if (!day || !month || !year) return ''
  return `${day}/${month}/${year}`
}

export function toInputDate(dateString) {
  if (!dateString) return ''
  const [day, month, year] = String(dateString).split('/')
  if (!day || !month || !year) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
