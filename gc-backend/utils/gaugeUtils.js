// Utility functions for normalizing and sanitizing gauge data before DB writes.
const ALLOWED_PATCH_FIELDS = new Set([
  'gauge_id',
  'gauge_name',
  'gauge_type',
  'location',
  'status',
  'frequency',
  'last_completion_date',
  'due_date',
  'schedule_table',
  'stakeholders',
  'batch_keys',
  'latest_prediction',
]);


// Date helpers
function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  // Handle numeric Excel serial dates or Unix timestamps
  if (typeof value === 'number' && !Number.isNaN(value)) {
    // Likely an Excel serial date (e.g. 45132) or unix ms timestamp
    if (value > 1000000000000) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // Excel serial conversion (accounts for Excel leap-year bug)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    let days = Math.floor(value);
    if (days > 59) days -= 1; // Excel incorrectly treats 1900 as leap year
    const d = new Date(excelEpoch.getTime() + days * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const text = String(value).trim();
  if (!text) return null;

  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const parsed = new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const dmyDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyDate) {
    const parsed = new Date(Date.UTC(Number(dmyDate[3]), Number(dmyDate[2]) - 1, Number(dmyDate[1])));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}


// Status helpers
function normalizeScheduleStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'not-started';
  if (normalized === 'not started' || normalized === 'not-started') return 'not-started';
  if (normalized === 'in progress' || normalized === 'in-progress' || normalized === 'pending') return 'in-progress';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'overdue') return 'overdue';
  return 'not-started';
}


// Schedule helpers
function normalizeScheduleRow(row, index) {
  const scheduleId = Number(row?.schedule_id ?? row?.['Row ID'] ?? row?.id ?? index + 1);

  return {
    schedule_id: Number.isFinite(scheduleId) && scheduleId > 0 ? scheduleId : index + 1,
    due_date: parseDateValue(row?.due_date ?? row?.['Due Date']),
    completion_date: parseDateValue(row?.completion_date ?? row?.['Completion Date']),
    status: normalizeScheduleStatus(row?.status ?? row?.Status),
    reminder_at: parseDateValue(row?.reminder_at),
    escalation_at: parseDateValue(row?.escalation_at),
  };
}

function normalizeLatestPredictionPatch(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {};

  if ('risk_score' in source) normalized.risk_score = source.risk_score ?? null;
  if ('risk_level' in source) normalized.risk_level = source.risk_level ?? null;
  if ('action' in source) normalized.action = source.action ?? null;
  if ('reason' in source) normalized.reason = source.reason ?? null;
  if ('signals' in source) normalized.signals = Array.isArray(source.signals) ? source.signals : [];
  if ('issue_type' in source) normalized.issue_type = source.issue_type ?? null;
  if ('recommended_frequency' in source) normalized.recommended_frequency = source.recommended_frequency ?? null;
  if ('recommended_due_date' in source) normalized.recommended_due_date = parseDateValue(source.recommended_due_date);
  if ('scored_at' in source) normalized.scored_at = parseDateValue(source.scored_at);

  return normalized;
}


// Gauge patch sanitizer
function sanitizeGaugePatch(payload, { normalizeStakeholdersPayload }) {
  const patch = {};

  ALLOWED_PATCH_FIELDS.forEach((field) => {
    if (!(field in (payload || {}))) return;

    if (field === 'stakeholders') {
      const stakeholders = normalizeStakeholdersPayload(payload[field]);
      patch.stakeholders = {
        operators: stakeholders.operators,
        supervisors: stakeholders.supervisors,
      };
      return;
    }

    if (field === 'schedule_table') {
      patch.schedule_table = Array.isArray(payload[field])
        ? payload[field].map((row, index) => normalizeScheduleRow(row, index))
        : [];
      return;
    }

    if (field === 'latest_prediction') {
      patch.latest_prediction = normalizeLatestPredictionPatch(payload[field]);
      return;
    }

    if (field === 'frequency') {
      const frequency = Number(payload[field]);
      patch.frequency = Number.isFinite(frequency) ? frequency : 0;
      return;
    }

    if (field === 'status') {
      patch.status = normalizeScheduleStatus(payload[field]);
      return;
    }

    if (field === 'due_date' || field === 'last_completion_date') {
      patch[field] = parseDateValue(payload[field]);
      return;
    }

    patch[field] = payload[field];
  });

  return patch;
}

/**
 * Business rule: a schedule row becomes 'overdue' once today is at least
 * OVERDUE_THRESHOLD_DAYS past its due_date.
 *
 * Rule: due_date + OVERDUE_THRESHOLD_DAYS days <= today  →  status = 'overdue'
 *
 * Exported so the rule is a single, shared source of truth.
 */
const OVERDUE_THRESHOLD_DAYS = 15;

/**
 * Returns the correct status for a non-completed schedule row based on today.
 *
 * Logic:
 *   daysSinceDue >= OVERDUE_THRESHOLD_DAYS (15)  →  'overdue'
 *   daysSinceDue >= 0 (due today or within threshold)  →  'in-progress'
 *   daysSinceDue <  0 (due in the future)              →  'not-started'
 *
 * Returns null if due_date is missing/invalid (caller should skip the row).
 */
function deriveRowStatus(row, today) {
  if (!row.due_date) return null;
  const due = new Date(row.due_date);
  due.setHours(0, 0, 0, 0);
  if (isNaN(due.getTime())) return null;

  const daysSinceDue = Math.floor((today - due) / (1000 * 60 * 60 * 24));

  if (daysSinceDue >= OVERDUE_THRESHOLD_DAYS) return 'overdue';
  if (daysSinceDue >= 0) return 'in-progress'; // due today or within threshold
  return 'not-started';                         // due in the future
}


module.exports = {
  parseDateValue,
  normalizeScheduleStatus,
  normalizeScheduleRow,
  normalizeLatestPredictionPatch,
  sanitizeGaugePatch,
  deriveRowStatus,
  OVERDUE_THRESHOLD_DAYS,
};
