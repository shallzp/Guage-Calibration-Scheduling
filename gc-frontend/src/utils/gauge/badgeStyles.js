// ── Risk level ──────────────────────────────────────────────────────────────
// Keys are lowercase strings matching gauge.riskLevel / latest_prediction.risk_level
export const RISK_BADGE_STYLES = {
  high:   'bg-rose-100   text-rose-700   border-rose-200',
  medium: 'bg-amber-100  text-amber-700  border-amber-200',
  low:    'bg-emerald-100 text-emerald-700 border-emerald-200',
}

/** Returns the Tailwind class string for a risk badge, or null if unknown. */
export function riskBadgeStyle(level) {
  return RISK_BADGE_STYLES[String(level || '').trim().toLowerCase()] ?? null
}

/** Returns the card-border / background style for a risk-coloured card. */
export function riskCardStyle(level) {
  const l = String(level || '').trim().toLowerCase()
  if (l === 'high')   return 'border-rose-200   bg-rose-50/40   hover:border-rose-300   hover:bg-rose-50/60'
  if (l === 'medium') return 'border-amber-200  bg-amber-50/40  hover:border-amber-300  hover:bg-amber-50/60'
  if (l === 'low')    return 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/60'
  return 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
}

// ── Gauge / schedule status ──────────────────────────────────────────────────
// Keys match the exact status strings stored in the DB ("In Progress", etc.)
export const STATUS_BADGE_STYLES = {
  'In Progress': 'bg-blue-100   text-blue-700   border-blue-200',
  'Not Started': 'bg-slate-100  text-slate-600  border-slate-200',
  'Completed':   'bg-teal-100   text-teal-700   border-teal-200',
  'Overdue':     'bg-orange-100 text-orange-700 border-orange-200',
}

/**
 * Returns the Tailwind class string for a status badge.
 * Accepts the exact stored string ("In Progress") or a normalised key ("in_progress").
 */
export function statusBadgeStyle(status) {
  const exact = STATUS_BADGE_STYLES[status]
  if (exact) return exact
  // Try normalised → display form
  const norm = String(status || '').toLowerCase().replace(/\s+/g, '_')
  const map = {
    in_progress: STATUS_BADGE_STYLES['In Progress'],
    not_started: STATUS_BADGE_STYLES['Not Started'],
    completed:   STATUS_BADGE_STYLES['Completed'],
    overdue:     STATUS_BADGE_STYLES['Overdue'],
  }
  return map[norm] ?? null
}

// ── Recommended action ───────────────────────────────────────────────────────
export function actionBadgeStyle(action) {
  const n = String(action || '').toLowerCase()
  if (n.includes('increase'))   return 'bg-violet-100 text-violet-700 border-violet-200'
  if (n.includes('reschedule')) return 'bg-sky-100    text-sky-700    border-sky-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

// ── Generic info chips (gauge id, name, dept) ────────────────────────────────
export const INFO_CHIP_STYLE    = 'bg-slate-100 text-slate-700'
export const FREQ_CHIP_STYLE    = 'bg-indigo-50 text-indigo-700'
