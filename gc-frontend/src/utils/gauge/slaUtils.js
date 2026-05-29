import { addHours, formatDateTime, parseDate } from '../dateUtils'
import { STATUS } from './gaugeDataUtils'

// Normalises a due-date string to midnight (00:00) of that date.
function getDueDeadline(dueDateStr) {
    const d = parseDate(dueDateStr)
    if (!d) return null
    d.setHours(0, 0, 0, 0)
    return d
}

// Parses a "DD/MM/YYYY HH:MM AM/PM" string produced by formatDateTime.
function parseDateTime(str) {
    if (!str || str === '-') return null
    const parts = str.split(' ')
    if (parts.length < 3) return null
    const [datePart, timePart, period] = parts
    const [day, month, year] = datePart.split('/').map(Number)
    let [hours, minutes] = timePart.split(':').map(Number)
    if (!day || !month || !year) return null
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0)
}


export function calculateReminderDate(dueDateStr, status, config = null) {
    if (!config) return '-'
    if (!dueDateStr) return '-'
    if (status === STATUS.COMPLETED) return '-'

    const deadline = getDueDeadline(dueDateStr)
    if (!deadline) return '-'

    const now = new Date()
    const rules = config

    if (status === STATUS.NOT_STARTED) {
        // Reminder fires X hours before the 00:00 deadline
        const reminderDate = addHours(deadline, -rules.reminderNotStartedHours)
        return formatDateTime(reminderDate)
    }

    if (status === STATUS.OVERDUE) {
        // Task is overdue at 00:01; recurring reminders start from 00:00 of due date
        const intervalHours = rules.reminderOverdueIntervalHours
        const diffMs = now.getTime() - deadline.getTime()

        if (diffMs <= 0) {
            return formatDateTime(addHours(deadline, intervalHours))
        }

        const diffHours = diffMs / (1000 * 60 * 60)
        let cycles = Math.ceil(diffHours / intervalHours)
        if (cycles === 0) cycles = 1
        let nextDate = addHours(deadline, cycles * intervalHours)

        if (nextDate.getTime() <= now.getTime()) {
            nextDate = addHours(deadline, (cycles + 1) * intervalHours)
        }

        return formatDateTime(nextDate)
    }

    return '-'
}

export function calculateEscalationDate(dueDateStr, status, config = null) {
    if (!config) return '-'
    if (!dueDateStr) return '-'
    if (status === STATUS.COMPLETED) return '-'

    const deadline = getDueDeadline(dueDateStr)
    if (!deadline) return '-'

    const now = new Date()
    const rules = config

    if (status === STATUS.NOT_STARTED) {
        const initialHours = rules.escalationNotStartedInitialHours
        const intervalHours = rules.escalationNotStartedIntervalHours
        const diffMs = now.getTime() - deadline.getTime()

        if (diffMs <= 0) {
            return formatDateTime(addHours(deadline, initialHours))
        }

        const diffHours = diffMs / (1000 * 60 * 60)
        let nextHours = initialHours
        while (nextHours < diffHours) {
            nextHours += intervalHours
        }
        let nextDate = addHours(deadline, nextHours)
        if (nextDate.getTime() <= now.getTime()) {
            nextDate = addHours(deadline, nextHours + intervalHours)
        }
        return formatDateTime(nextDate)
    }

    if (status === STATUS.OVERDUE) {
        const initialHours = rules.escalationOverdueInitialHours
        const intervalHours = rules.escalationOverdueIntervalHours
        const diffMs = now.getTime() - deadline.getTime()

        if (diffMs <= 0) {
            return formatDateTime(addHours(deadline, initialHours))
        }

        const diffHours = diffMs / (1000 * 60 * 60)
        let nextHours = initialHours
        while (nextHours < diffHours) {
            nextHours += intervalHours
        }
        let nextDate = addHours(deadline, nextHours)
        if (nextDate.getTime() <= now.getTime()) {
            nextDate = addHours(deadline, nextHours + intervalHours)
        }
        return formatDateTime(nextDate)
    }

    return '-'
}

const SENT_EMAILS_KEY = 'slaSentEmails'

function getSentEmails() {
    try {
        const saved = localStorage.getItem(SENT_EMAILS_KEY)
        if (saved) return JSON.parse(saved)
    } catch {
        // ignore
    }
    return []
}

function saveSentEmails(entries) {
    localStorage.setItem(SENT_EMAILS_KEY, JSON.stringify(entries))
}

function makeEmailKey(type, gaugeId, dueDate, scheduledDateTime) {
    return `${type}|${gaugeId}|${dueDate}|${scheduledDateTime}`
}

export function processSLAEmails(gauges, config = null) {
    const now = new Date()
    const nowStr = formatDateTime(now)

    const previouslySent = getSentEmails()
    const sentSet = new Set(previouslySent)

    const emailsToSend = []

    gauges.forEach((gauge) => {
        gauge.schedule.forEach((row) => {
            if (row.status === STATUS.COMPLETED) return

            const reminderDateStr = calculateReminderDate(row.dueDate, row.status, config)
            const escalationDateStr = calculateEscalationDate(row.dueDate, row.status, config)

            // Check reminder — match if now is at or past the scheduled time but hasn't been sent
            if (reminderDateStr !== '-') {
                const key = makeEmailKey('Reminder', gauge.gaugeId, row.dueDate, reminderDateStr)
                if (!sentSet.has(key)) {
                    const scheduled = parseDateTime(reminderDateStr)
                    if (scheduled && now.getTime() >= scheduled.getTime()) {
                        emailsToSend.push({
                            type: 'Reminder',
                            gaugeId: gauge.gaugeId,
                            dueDate: row.dueDate,
                            status: row.status,
                            scheduledAt: reminderDateStr,
                            processedAt: nowStr,
                        })
                        sentSet.add(key)
                    }
                }
            }

            // Check escalation
            if (escalationDateStr !== '-') {
                const key = makeEmailKey('Escalation', gauge.gaugeId, row.dueDate, escalationDateStr)
                if (!sentSet.has(key)) {
                    const scheduled = parseDateTime(escalationDateStr)
                    if (scheduled && now.getTime() >= scheduled.getTime()) {
                        emailsToSend.push({
                            type: 'Escalation',
                            gaugeId: gauge.gaugeId,
                            dueDate: row.dueDate,
                            status: row.status,
                            scheduledAt: escalationDateStr,
                            processedAt: nowStr,
                        })
                        sentSet.add(key)
                    }
                }
            }
        })
    })

    // Persist sent keys to avoid duplicates on next run
    saveSentEmails(Array.from(sentSet))

    console.log('--- SLA Email Processing ---')
    if (emailsToSend.length === 0) {
        console.log('No SLA emails to send right now.')
    } else {
        console.table(emailsToSend)
    }

    return emailsToSend
}

export function applySLAConfigToGauges(gauges, config = null) {
    if (!config) return gauges || []
    const rules = config
    return (gauges || []).map((gauge) => ({
        ...gauge,
        schedule: (gauge.schedule || []).map((row) => ({
            ...row,
            reminderDateTime: calculateReminderDate(row.dueDate, row.status, rules),
            escalationDateTime: calculateEscalationDate(row.dueDate, row.status, rules),
        })),
    }))
}