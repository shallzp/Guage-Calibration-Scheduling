const mongoose = require('mongoose');
const { parseDateValue } = require('./gaugeUtils');

// ── Batch-key date helpers ────────────────────────────────────────────────────

// Converts a BATCH-YYYYMMDD key into a JS Date (UTC midnight).
function batchKeyToDate(key) {
  const raw = key.replace('BATCH-', '');
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

// Parses a date value that may be a Date, ISO string, or DD/MM/YYYY string.
function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  }
  const parsed = new Date(str);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Compares two date values as UTC calendar days (day-level).
 * Returns true if they represent the same calendar day.
 */
function sameDayUtc(a, b) {
  const da = parseAnyDate(a);
  const db = parseAnyDate(b);
  if (!da || !db) return false;
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth()    === db.getUTCMonth()    &&
    da.getUTCDate()     === db.getUTCDate()
  );
}

/**
 * Returns delay in whole days between due_date and completion_date.
 * Null if completion_date is missing or not after due_date.
 */
function calcDelayDays(due_date, completion_date) {
  const due  = parseAnyDate(due_date);
  const done = parseAnyDate(completion_date);
  if (!due || !done) return null;
  const diffMs = done.getTime() - due.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}


function normalizeObjectId(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return new mongoose.Types.ObjectId(value);
  if (value.$oid) return new mongoose.Types.ObjectId(value.$oid);
  return value;
}

function toCampaignDocument(record) {
  const sanitized = {
    ...record,
    'Start Date': parseDateValue(record['Start Date']),
    'End Date': parseDateValue(record['End Date']),
    'Job Card Created Date': parseDateValue(record['Job Card Created Date']),
    'Claim Date': parseDateValue(record['Claim Date']),
  };

  // Clean up fields that should be strings or null (not empty objects)
  const stringFields = ['Culprit Desc.', 'Part Desc.', 'Job Card Number', 'Claim Number'];
  stringFields.forEach(field => {
    const value = sanitized[field];
    // Convert empty objects or invalid values to null
    if (value && typeof value === 'object' && Object.keys(value).length === 0) {
      sanitized[field] = null;
    }
  });

  return sanitized;
}

function toUserDocument(record) {
  return {
    ...record,
    _id: normalizeObjectId(record._id),
  };
}

function toGaugeDocument(record) {
  return {
    ...record,
    due_date: parseDateValue(record.due_date),
    last_completion_date: parseDateValue(record.last_completion_date),
    stakeholders: {
      operators: (record.stakeholders?.operators || []).map((item) => ({
        user_id: normalizeObjectId(item.user_id),
      })),
      supervisors: (record.stakeholders?.supervisors || []).map((item) => ({
        user_id: normalizeObjectId(item.user_id),
      })),
    },
    schedule_table: (record.schedule_table || []).map((row) => ({
      ...row,
      due_date: parseDateValue(row.due_date),
      completion_date: parseDateValue(row.completion_date),
      reminder_at: parseDateValue(row.reminder_at),
      escalation_at: parseDateValue(row.escalation_at),
    }))
  };
}

function toCurrentBatchDocument(record) {
  return {
    ...record,
    date: parseDateValue(record.date),
    generated_at: parseDateValue(record.generated_at),
  };
}

function toPreviousBatchDocument(record) {
  return {
    ...record,
    date: parseDateValue(record.date),
    generated_at: parseDateValue(record.generated_at),
    archived_at: parseDateValue(record.archived_at),
    snapshot: (record.snapshot || []).map((row) => ({
      ...row,
      recommended_due_date: parseDateValue(row.recommended_due_date),
    })),
  };
}

/**
 * Derives current_batches and previous_batches from the gauges array.
 *
 * Snapshot policy for previous_batches (seeding):
 *   - Fields calculable from schedule_table are backfilled with real values.
 *   - ML-dependent fields (risk_score, risk_level) are null — they have no
 *     historical ML output at seed time and will never be overwritten
 *     (write-once policy in upsertPreviousBatch).
 */
function buildBatchSeedData(gauges) {
  const currentMap  = {};
  const previousMap = {};

  for (const gauge of gauges) {
    const batchKeys    = gauge.batch_keys || {};
    const scheduleRows = gauge.schedule_table || [];
    const frequency    = Number(gauge.frequency) || 0;

    for (const [key, status] of Object.entries(batchKeys)) {
      if (status !== 'current' && status !== 'previous') continue;

      const batchDate = batchKeyToDate(key);

      // ── current_batches ───────────────────────────────────────────────────
      if (status === 'current') {
        if (!currentMap[key]) {
          currentMap[key] = {
            _id:          key,
            date:         batchDate,
            gauge_keys:   [],
            gauge_count:  0,
            risk_summary: { high: 0, medium: 0, low: 0 },
            batch_risk:   0,
            generated_at: new Date(),
          };
        }
        currentMap[key].gauge_keys.push(gauge.gauge_key);
        currentMap[key].gauge_count++;
      }

      // ── previous_batches ──────────────────────────────────────────────────
      if (status === 'previous') {
        if (!previousMap[key]) {
          previousMap[key] = {
            _id:          key,
            date:         batchDate,
            gauge_keys:   [],
            gauge_count:  0,
            risk_summary: { high: 0, medium: 0, low: 0 },
            generated_at: batchDate,
            archived_at:  batchDate,
            snapshot:     [],
          };
        }

        previousMap[key].gauge_keys.push(gauge.gauge_key);
        previousMap[key].gauge_count++;

        const matchRow   = scheduleRows.find((row) => sameDayUtc(row.due_date, batchDate));
        const delay_days = matchRow ? calcDelayDays(matchRow.due_date, matchRow.completion_date) : null;
        const days_overdue = (delay_days !== null && delay_days > 0) ? delay_days : 0;

        previousMap[key].snapshot.push({
          gauge_key:             gauge.gauge_key,
          // ML prediction fields — null at seed time
          risk_score:            null,
          risk_level:            null,
          action:                null,
          reason:                null,
          recommended_frequency: null,
          recommended_due_date:  null,
          // ML feature fields — null at seed, except what schedule gives us
          days_until_due:        0,
          days_overdue,
          is_overdue:            null,
          overdue_count:         null,
          completion_rate:       null,
          avg_delay_days:        delay_days,  // best available from schedule data
          max_delay_days:        null,
          predicted_overrun:     null,
          history_size:          null,
          // gauge root
          frequency_at_batch:    frequency,
          // completion_status intentionally absent
        });
      }
    }
  }

  return {
    currentBatches:  Object.values(currentMap),
    previousBatches: Object.values(previousMap),
  };
}

/**
 * Builds all-batches seed data for the unified `batches` collection.
 *
 * Groups ALL batch_keys entries (current, previous, null/upcoming) by batch name.
 * - gauge_keys: array of { gauge_key, status } where status is the dict value
 * - batch_status: 'current' if any gauge has it as current,
 *                 'previous' if all are previous,
 *                 'upcoming' if all are null
 * - snapshot: backfilled from matching schedule_table row for every entry
 */
function buildAllBatchesSeedData(gauges) {
  // Map: batchKey → batch document
  const batchMap = {};

  for (const gauge of gauges) {
    const batchKeys    = gauge.batch_keys || {};
    const scheduleRows = gauge.schedule_table || [];
    const frequency    = Number(gauge.frequency) || 0;

    for (const [key, status] of Object.entries(batchKeys)) {
      const batchDate = batchKeyToDate(key);

      if (!batchMap[key]) {
        batchMap[key] = {
          _id:          key,
          date:         batchDate,
          gauge_keys:   [],
          gauge_count:  0,
          risk_summary: { high: 0, medium: 0, low: 0 },
          batch_risk:   0,
          batch_status: null,
          generated_at: batchDate,
          archived_at:  status === 'previous' ? batchDate : null,
          snapshot:     [],
        };
      }

      const batch = batchMap[key];
      batch.gauge_keys.push({ gauge_key: gauge.gauge_key, status: status ?? null });
      batch.gauge_count++;

      const matchRow   = scheduleRows.find((row) => sameDayUtc(row.due_date, batchDate));
      const delay_days = matchRow ? calcDelayDays(matchRow.due_date, matchRow.completion_date) : null;
      const days_overdue = (delay_days !== null && delay_days > 0) ? delay_days : 0;

      batch.snapshot.push({
        gauge_key:             gauge.gauge_key,
        // ML prediction fields — null at seed time
        risk_score:            null,
        risk_level:            null,
        action:                null,
        reason:                null,
        recommended_frequency: null,
        recommended_due_date:  null,
        // ML feature fields — null at seed, except what schedule gives us
        days_until_due:        0,
        days_overdue,
        is_overdue:            null,
        overdue_count:         null,
        completion_rate:       null,
        avg_delay_days:        delay_days,
        max_delay_days:        null,
        predicted_overrun:     null,
        history_size:          null,
        // gauge root
        completion_status:     matchRow ? matchRow.status : null,
        frequency_at_batch:    frequency,
      });
    }
  }

  for (const batch of Object.values(batchMap)) {
    const statuses = batch.gauge_keys.map((g) => g.status);
    if (statuses.includes('current'))           
      batch.batch_status = 'current';
    else if (statuses.every((s) => s === 'previous')) 
      batch.batch_status = 'previous';
    else                                         
      batch.batch_status = 'upcoming';
  }

  return Object.values(batchMap);
}

module.exports = {
  normalizeObjectId,
  toCampaignDocument,
  toUserDocument,
  toGaugeDocument,
  toCurrentBatchDocument,
  toPreviousBatchDocument,
  buildBatchSeedData,
  buildAllBatchesSeedData,
};