import { formatDate, parseDate } from '../dateUtils'

export const STATUS = {
  IN_PROGRESS: 'In Progress',
  NOT_STARTED: 'Not Started',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
}

export function getCurrentStatusFromSchedule(scheduleRows, fallbackStatus = STATUS.NOT_STARTED) {
  if (!scheduleRows || !scheduleRows.length) return fallbackStatus;
  let lastCompletedIndex = -1;
  for (let i = scheduleRows.length - 1; i >= 0; i--) {
    if (scheduleRows[i].status === STATUS.COMPLETED) {
      lastCompletedIndex = i;
      break;
    }
  }
  const currentIndex = lastCompletedIndex + 1;
  if (currentIndex < scheduleRows.length) {
    return scheduleRows[currentIndex].status;
  }
  return fallbackStatus;
}

export function getCurrentDueDate(scheduleRows, fallback) {
  if (!scheduleRows || !scheduleRows.length) return fallback || '-';
  let lastCompletedIndex = -1;
  for (let i = scheduleRows.length - 1; i >= 0; i--) {
    if (scheduleRows[i].status === STATUS.COMPLETED) {
      lastCompletedIndex = i;
      break;
    }
  }
  const currentIndex = lastCompletedIndex + 1;
  if (currentIndex < scheduleRows.length) {
    return scheduleRows[currentIndex].dueDate;
  }
  if (fallback) return fallback;
  return scheduleRows[scheduleRows.length - 1]?.dueDate || '-';
}

export function getLastCompletionDateFromSchedule(scheduleRows, fallback) {
  const completedDates = scheduleRows
    .filter((row) => row.status === STATUS.COMPLETED && row.completionDate)
    .map((row) => row.completionDate)

  if (!completedDates.length) return fallback || '-'

  const sorted = completedDates
    .map((dateText) => ({ text: dateText, parsed: parseDate(dateText) }))
    .filter((item) => item.parsed !== null)
    .sort((left, right) => left.parsed - right.parsed)

  if (!sorted.length) return fallback || '-'
  return sorted[sorted.length - 1].text
}

export function getRiskActionLabel(action) {
  const normalized = String(action || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!normalized || normalized === 'no_change' || normalized === 'no_chnage' || normalized === 'nochange') {
    return 'No Change'
  }
  if (normalized.includes('increase')) return 'Increase Frequency'
  if (normalized.includes('reschedule')) return 'Reschedule'
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getRiskLevelLabel(level) {
  const normalized = String(level || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return ''
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'low') return 'Low'
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}


function normalizeApiStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'completed') return STATUS.COMPLETED
  if (value === 'overdue') return STATUS.OVERDUE
  if (value === 'in-progress' || value === 'in progress') return STATUS.IN_PROGRESS
  return STATUS.NOT_STARTED
}

function formatApiDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDate(parsed)
}

export function toGaugeModelFromApi(record) {
  const schedule = Array.isArray(record?.schedule_table)
    ? record.schedule_table.map((row, index) => ({
        id: Number(row?.schedule_id) || index + 1,
        dueDate: formatApiDate(row?.due_date),
        completionDate: formatApiDate(row?.completion_date),
        status: normalizeApiStatus(row?.status),
      }))
    : []
  const dueDate = formatApiDate(record?.due_date)
  const lastCompletion = formatApiDate(record?.last_completion_date)
  const fallbackStatus = normalizeApiStatus(record?.status)

  return {
    key: record?.gauge_key || `${record?.location || ''}::${record?.gauge_id || ''}`,
    currentLocation: record?.location || '',
    gaugeId: record?.gauge_id || '',
    gaugeName: record?.gauge_name || '',
    frequency: Number(record?.frequency) || 0,
    dueDate: dueDate || '-',
    lastCompletionDate: lastCompletion || '-',
    currentStatus: fallbackStatus || STATUS.NOT_STARTED,
    riskLevel: String(record?.latest_prediction?.risk_level || '').trim().toLowerCase(),
    riskScore: record?.latest_prediction?.risk_score ?? null,
    riskAction: String(record?.latest_prediction?.action || '').trim(),
    riskReason: String(record?.latest_prediction?.reason || '').trim(),
    riskSignals: Array.isArray(record?.latest_prediction?.signals)
      ? record.latest_prediction.signals.filter(Boolean).map(String)
      : [],
    recommendedFrequency: Number(record?.latest_prediction?.recommended_frequency) || null,
    recommendedDueDate: formatApiDate(record?.latest_prediction?.recommended_due_date),
    schedule,
  }
}
