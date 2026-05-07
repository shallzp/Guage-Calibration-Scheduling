import { addDays, addMonthsClamped, formatDate, parseDate } from './dateUtils'

export const STATUS = {
  IN_PROGRESS: 'In Progress',
  NOT_STARTED: 'Not Started',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
}

function extractScheduleDueDate(row) {
  const dateKey = Object.keys(row).find((key) => key.toLowerCase().startsWith('date'))
  return dateKey ? row[dateKey] : ''
}

function buildSchedule(dueDateValue, frequency) {
  const firstDate = parseDate(dueDateValue)
  if (!firstDate) return []

  return Array.from({ length: 3 }, (_, index) => ({
    id: index + 1,
    dueDate: formatDate(addMonthsClamped(firstDate, frequency * index)),
    status: index === 0 ? STATUS.IN_PROGRESS : STATUS.NOT_STARTED,
    completionDate: '',
  }))
}

export function appendNextScheduleDate(scheduleRows, frequency) {
  if (!scheduleRows.length) return scheduleRows

  const lastRow = scheduleRows[scheduleRows.length - 1]
  const lastDueDate = parseDate(lastRow.dueDate)
  if (!lastDueDate) return scheduleRows

  const nextDueDate = formatDate(addMonthsClamped(lastDueDate, frequency))
  return [
    ...scheduleRows,
    {
      id: scheduleRows.length + 1,
      dueDate: nextDueDate,
      status: STATUS.NOT_STARTED,
      completionDate: '',
    },
  ]
}

function normalizeStatus(status, index) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'completed') return STATUS.COMPLETED
  if (value === 'overdue') return STATUS.OVERDUE
  if (value === 'pending' || value === 'in progress' || value === 'in-progress') return STATUS.IN_PROGRESS
  if (value === 'not started') return STATUS.NOT_STARTED
  return index === 0 ? STATUS.IN_PROGRESS : STATUS.NOT_STARTED
}

function buildScheduleFromRecord(record, frequency) {
  const recordSchedule = Array.isArray(record['Schedule Table']) ? record['Schedule Table'] : []
  if (!recordSchedule.length) {
    return buildSchedule(record['Due Date'], frequency)
  }

  return recordSchedule.map((row, index) => {
    const dueDate = extractScheduleDueDate(row)
    const status = normalizeStatus(row.Status, index)
    const completionDate = row['Completion Date'] || (status === STATUS.COMPLETED ? dueDate : '')

    return {
      id: index + 1,
      dueDate,
      status,
      completionDate,
    }
  })
}

function getOverdueThreshold(dueDate) {
  const due = parseDate(dueDate)
  if (!due) return null
  return addDays(due, 15)
}

export function applyOverdueRule(scheduleRows) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return scheduleRows.map((row) => {
    if (row.status === STATUS.COMPLETED) return row
    const threshold = getOverdueThreshold(row.dueDate)
    if (!threshold) return row
    if (today > threshold) return { ...row, status: STATUS.OVERDUE }
    return row
  })
}

export function getCurrentDueDate(scheduleRows, fallback) {
  const nextOpenRow = scheduleRows.find((row) => row.status !== STATUS.COMPLETED)
  if (nextOpenRow?.dueDate) return nextOpenRow.dueDate
  if (fallback) return fallback
  return scheduleRows[scheduleRows.length - 1]?.dueDate || '-'
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

export function toGaugeModel(record) {
  const frequency = Number(record['Frequency']) || 1
  const schedule = applyOverdueRule(buildScheduleFromRecord(record, frequency))
  const initialLastCompletionDate = record['Last Completion Date'] || '-'

  return {
    key: `${record['Current Location']}::${record['Gauge ID']}`,
    currentLocation: record['Current Location'],
    gaugeId: record['Gauge ID'],
    gaugeName: record['Gauge Name'],
    frequency,
    dueDate: getCurrentDueDate(schedule, record['Due Date']),
    lastCompletionDate: getLastCompletionDateFromSchedule(schedule, initialLastCompletionDate),
    schedule,
  }
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
  const scheduleRows = Array.isArray(record?.schedule_table)
    ? record.schedule_table.map((row, index) => ({
        id: Number(row?.schedule_id) || index + 1,
        dueDate: formatApiDate(row?.due_date),
        completionDate: formatApiDate(row?.completion_date),
        status: normalizeApiStatus(row?.status),
      }))
    : []

  const schedule = applyOverdueRule(scheduleRows)
  const dueDate = formatApiDate(record?.due_date)
  const lastCompletion = formatApiDate(record?.last_completion_date)

  return {
    key: record?.gauge_key || `${record?.location || ''}::${record?.gauge_id || ''}`,
    currentLocation: record?.location || '',
    gaugeId: record?.gauge_id || '',
    gaugeName: record?.gauge_name || '',
    frequency: Number(record?.frequency) || 0,
    dueDate: dueDate || getCurrentDueDate(schedule, record?.due_date ? dueDate : '-'),
    lastCompletionDate: lastCompletion || getLastCompletionDateFromSchedule(schedule, '-'),
    currentStatus: normalizeApiStatus(record?.status),
    riskLevel: String(record?.latest_prediction?.risk_level || '').trim().toLowerCase(),
    riskScore: record?.latest_prediction?.risk_score ?? null,
    riskAction: String(record?.latest_prediction?.action || '').trim(),
    schedule,
  }
}
