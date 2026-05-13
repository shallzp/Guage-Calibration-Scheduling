const CurrentBatch = require('../models/gauge/CurrentBatch');
const PreviousBatch = require('../models/gauge/PreviousBatch');
const Batch = require('../models/gauge/Batch');
const Gauge = require('../models/gauge/Gauge');

// ─── helpers ────────────────────────────────────────────────────────────────

function toBatchDate(batchKey) {
  const dateStr = String(batchKey || '').replace('BATCH-', '');
  return new Date(Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(4, 6)) - 1,
    Number(dateStr.slice(6, 8)),
  ));
}

function toBatchKeyFromDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `BATCH-${y}${m}${d}`;
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds a real-time snapshot for the unified `batches` collection.
 * Includes completion_status — `batches` tracks live gauge state.
 * All fields sourced directly from gauge.latest_prediction and gauge.ml_features.
 */
function buildSnapshotFromGauge(gauge) {
  const p = gauge?.latest_prediction || {};  // prediction fields
  const f = gauge?.ml_features       || {};  // feature fields

  const daysUntilDue = normalizeNumber(f.days_until_due, 0);

  return {
    // identity
    gauge_key:             String(gauge?.gauge_key || '').trim(),

    // from latest_prediction
    risk_score:            p.risk_score            ?? null,
    risk_level:            p.risk_level            ?? null,
    action:                p.action                ?? null,
    reason:                p.reason                ?? null,
    recommended_frequency: p.recommended_frequency ?? null,
    recommended_due_date:  p.recommended_due_date  ?? null,

    // from ml_features
    days_until_due:        daysUntilDue,
    days_overdue:          daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0,
    is_overdue:            normalizeNumber(f.is_overdue,        null),
    overdue_count:         normalizeNumber(f.overdue_count,     null),
    completion_rate:       normalizeNumber(f.completion_rate,   null),
    avg_delay_days:        normalizeNumber(f.avg_delay_days,    null),
    max_delay_days:        normalizeNumber(f.max_delay_days,    null),
    predicted_overrun:     normalizeNumber(f.predicted_overrun, null),
    history_size:          normalizeNumber(f.history_size,      null),

    // from gauge root
    completion_status:     gauge?.status    ?? null,
    frequency_at_batch:    normalizeNumber(gauge?.frequency, null),
  };
}

/**
 * Builds a write-once snapshot for `previous_batches`.
 * Identical field set to buildSnapshotFromGauge EXCEPT:
 *   - completion_status is omitted (all gauges here are completed by definition)
 */
function buildPreviousSnapshotFromGauge(gauge) {
  const p = gauge?.latest_prediction || {};
  const f = gauge?.ml_features       || {};

  const daysUntilDue = normalizeNumber(f.days_until_due, 0);

  return {
    // identity
    gauge_key:             String(gauge?.gauge_key || '').trim(),

    // from latest_prediction
    risk_score:            p.risk_score            ?? null,
    risk_level:            p.risk_level            ?? null,
    action:                p.action                ?? null,
    reason:                p.reason                ?? null,
    recommended_frequency: p.recommended_frequency ?? null,
    recommended_due_date:  p.recommended_due_date  ?? null,

    // from ml_features
    days_until_due:        daysUntilDue,
    days_overdue:          daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0,
    is_overdue:            normalizeNumber(f.is_overdue,        null),
    overdue_count:         normalizeNumber(f.overdue_count,     null),
    completion_rate:       normalizeNumber(f.completion_rate,   null),
    avg_delay_days:        normalizeNumber(f.avg_delay_days,    null),
    max_delay_days:        normalizeNumber(f.max_delay_days,    null),
    predicted_overrun:     normalizeNumber(f.predicted_overrun, null),
    history_size:          normalizeNumber(f.history_size,      null),

    // from gauge root
    frequency_at_batch:    normalizeNumber(gauge?.frequency, null),
    // completion_status intentionally absent
  };
}

function deriveBatchStatus(entries = []) {
  const statuses = entries.map((item) => item?.status ?? null);
  if (statuses.includes('current')) return 'current';
  if (statuses.includes('previous')) return 'previous';
  if (statuses.length > 0) return 'upcoming';
  return null;
}

// ─── schedule-derived computations ──────────────────────────────────────────

function computeBatchKeys(scheduleRows) {
  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0) return {};

  const sorted = [...scheduleRows].sort((a, b) => Number(a.schedule_id) - Number(b.schedule_id));

  let lastCompletedIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === 'completed') { lastCompletedIdx = i; break; }
  }
  const currentIdx = lastCompletedIdx + 1;

  const batchKeys = {};
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (!row.due_date) continue;
    const key = toBatchKeyFromDate(row.due_date);
    if (!key) continue;
    if (i <= lastCompletedIdx)  batchKeys[key] = 'previous';
    else if (i === currentIdx)  batchKeys[key] = 'current';
    else                        batchKeys[key] = null;
  }
  return batchKeys;
}

// Computes root due_date and last_completion_date from schedule_table using batchKeys.
function computeGaugeDates(scheduleRows, batchKeys) {
  let due_date = null;
  let last_completion_date = null;

  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0 || !batchKeys) {
    return { due_date, last_completion_date };
  }

  for (const row of scheduleRows) {
    if (!row.due_date) continue;
    const key = toBatchKeyFromDate(row.due_date);
    if (!key) continue;

    const bStatus = batchKeys[key];
    if (bStatus === 'current') {
      due_date = row.due_date || null;
    } else if (bStatus === 'previous') {
      const cd = row.completion_date || row.due_date;
      if (!last_completion_date || new Date(cd) > new Date(last_completion_date)) {
        last_completion_date = cd || null;
      }
    }
  }

  return { due_date, last_completion_date };
}

// Computes root status from schedule_table using batchKeys.
function computeGaugeStatus(scheduleRows, batchKeys) {
  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0 || !batchKeys) return null;

  let hasCurrent = false;
  let currentStatus = null;

  for (const row of scheduleRows) {
    if (!row.due_date) continue;
    const key = toBatchKeyFromDate(row.due_date);
    if (!key) continue;

    if (batchKeys[key] === 'current') {
      hasCurrent = true;
      currentStatus = row.status;
      break;
    }
  }

  if (hasCurrent) return currentStatus;

  // If there are only 'previous' batches, the gauge is completed overall
  if (Object.values(batchKeys).includes('previous')) return 'completed';

  return scheduleRows[0].status;
}

// ─── low-level upsert helpers ────────────────────────────────────────────────

// Refresh the gauge's snapshot inside `batches` — always overwrites with the latest gauge state (real-time).
async function refreshBatchSnapshot(batchKey, gaugeKey, snapshot) {
  const doc = await Batch.findByIdAndUpdate(
    batchKey,
    { $pull: { snapshot: { gauge_key: gaugeKey } } },
    { returnDocument: 'after' },
  );
  if (!doc) return;
  await Batch.findByIdAndUpdate(batchKey, { $push: { snapshot } });
}

// Upsert a gauge into `batches` with the given status, refresh its snapshot(real-time), and recompute gauge_count / batch_status.
async function upsertBatchEntry(batchKey, batchDate, gaugeKey, newStatus, snapshot) {
  // Step 1 — ensure the document exists
  await Batch.findByIdAndUpdate(
    batchKey,
    { $setOnInsert: { _id: batchKey, date: batchDate, generated_at: new Date() } },
    { upsert: true },
  );

  // Step 2 — pull stale entries
  await Batch.findByIdAndUpdate(batchKey, {
    $pull: {
      gauge_keys: { gauge_key: gaugeKey },
      snapshot: { gauge_key: gaugeKey },
    },
  });

  // Step 3 — push fresh entries (snapshot always up-to-date in `batches`)
  const pushDoc = { gauge_keys: { gauge_key: gaugeKey, status: newStatus } };
  if (snapshot) pushDoc.snapshot = snapshot;
  const after = await Batch.findByIdAndUpdate(
    batchKey,
    { $push: pushDoc },
    { returnDocument: 'after' },
  );
  if (!after) return;

  await Batch.findByIdAndUpdate(batchKey, {
    $set: {
      gauge_count: (after.gauge_keys || []).length,
      batch_status: deriveBatchStatus(after.gauge_keys || []),
    },
  });
}

// Remove a gauge from `batches`. Deletes the document if it becomes empty.
async function removeBatchEntry(batchKey, gaugeKey) {
  const after = await Batch.findByIdAndUpdate(
    batchKey,
    { $pull: { gauge_keys: { gauge_key: gaugeKey }, snapshot: { gauge_key: gaugeKey } } },
    { returnDocument: 'after' },
  );
  if (!after) return;
  if ((after.gauge_keys || []).length === 0) {
    await Batch.findByIdAndDelete(batchKey);
    return;
  }
  await Batch.findByIdAndUpdate(batchKey, {
    $set: {
      gauge_count:  after.gauge_keys.length,
      batch_status: deriveBatchStatus(after.gauge_keys),
    },
  });
}

// Add / keep a gauge in `current_batches`.
async function upsertCurrentBatch(batchKey, batchDate, gaugeKey) {
  await CurrentBatch.findByIdAndUpdate(
    batchKey,
    {
      $setOnInsert: { _id: batchKey, date: batchDate },
      $addToSet: { gauge_keys: gaugeKey },
    },
    { upsert: true },
  );
  await CurrentBatch.findByIdAndUpdate(batchKey, [
    { $set: { gauge_count: { $size: '$gauge_keys' } } },
  ], { updatePipeline: true });
}

// Remove a gauge from `current_batches`. Deletes the document when empty.
async function removeCurrentBatch(batchKey, gaugeKey) {
  const after = await CurrentBatch.findByIdAndUpdate(
    batchKey,
    { $pull: { gauge_keys: gaugeKey } },
    { returnDocument: 'after' },
  );
  if (!after) return;
  if (after.gauge_keys.length === 0) {
    await CurrentBatch.findByIdAndDelete(batchKey);
    return;
  }
  await CurrentBatch.findByIdAndUpdate(batchKey, [
    { $set: { gauge_count: { $size: '$gauge_keys' } } },
  ], { updatePipeline: true });
}

/**
 * Add a gauge to `previous_batches`.
 * Snapshot is written once on first archival — never overwritten.
 * Uses buildPreviousSnapshotFromGauge shape (no completion_status).
 */
async function upsertPreviousBatch(batchKey, batchDate, gaugeKey, previousSnapshot) {
  const existing = await PreviousBatch.findById(batchKey).lean();
  const snapshotAlreadyWritten =
    existing &&
    Array.isArray(existing.snapshot) &&
    existing.snapshot.some((s) => s.gauge_key === gaugeKey);

  await PreviousBatch.findByIdAndUpdate(
    batchKey,
    {
      $setOnInsert: {
        _id:          batchKey,
        date:         batchDate,
        generated_at: new Date(),
        archived_at:  new Date(),
      },
      $addToSet: { gauge_keys: gaugeKey },
    },
    { upsert: true },
  );

  if (previousSnapshot && !snapshotAlreadyWritten) {
    await PreviousBatch.findByIdAndUpdate(
      batchKey,
      { $push: { snapshot: previousSnapshot } },
    );
  }

  await PreviousBatch.findByIdAndUpdate(batchKey, [
    { $set: { gauge_count: { $size: '$gauge_keys' } } },
  ], { updatePipeline: true });
}

// Remove a gauge from `previous_batches`. Deletes the document if it becomes empty.
async function removePreviousBatch(batchKey, gaugeKey) {
  const after = await PreviousBatch.findByIdAndUpdate(
    batchKey,
    { $pull: { gauge_keys: gaugeKey, snapshot: { gauge_key: gaugeKey } } },
    { returnDocument: 'after' },
  );
  if (!after) return;
  if ((after.gauge_keys || []).length === 0) {
    await PreviousBatch.findByIdAndDelete(batchKey);
    return;
  }
  await PreviousBatch.findByIdAndUpdate(batchKey, [
    { $set: { gauge_count: { $size: '$gauge_keys' } } },
  ], { updatePipeline: true });
}


// ─── main sync ───────────────────────────────────────────────────────────────

/**
 * Syncs `batches`, `current_batches`, and `previous_batches` for one gauge.
 *
 * Snapshot policies:
 *   batches          → always reflects latest gauge state (real-time overwrite)
 *   previous_batches → written once on first archival, never updated after that
 */
async function syncBatchCollections(gaugeKey, oldMap, newMap) {
  let oldKeys = {};
  if (oldMap instanceof Map) {
    oldKeys = Object.fromEntries(oldMap);
  } else if (Array.isArray(oldMap)) {
    for (const key of oldMap) { if (typeof key === 'string') oldKeys[key] = null; }
  } else if (oldMap && typeof oldMap === 'object') {
    oldKeys = { ...oldMap };
  }

  const newKeys = (newMap && typeof newMap === 'object' && !Array.isArray(newMap))
    ? { ...newMap }
    : {};

  const allKeys = new Set([...Object.keys(oldKeys), ...Object.keys(newKeys)]);

  // Fetch latest gauge state once — used for `batches` real-time snapshot
  const gauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
  const snapshot = gauge ? buildSnapshotFromGauge(gauge) : null;

  for (const batchKey of allKeys) {
    const oldStatus = oldKeys[batchKey] ?? null;
    const newStatus = newKeys[batchKey] ?? null;
    const batchDate = toBatchDate(batchKey);
    const keyStillExists = batchKey in newKeys;

    // ── `batches` — always real-time ────────────────────────────────────────

    if (!keyStillExists) {
      await removeBatchEntry(batchKey, gaugeKey);
    } else if (oldStatus === newStatus && snapshot) {
      // No status change — refresh snapshot only (real-time update)
      await refreshBatchSnapshot(batchKey, gaugeKey, snapshot);
    } else {
      // Status changed or new key — upsert with latest snapshot
      await upsertBatchEntry(batchKey, batchDate, gaugeKey, newStatus, snapshot);
    }

    // ── `current_batches` ───────────────────────────────────────────────────

    if (newStatus === 'current') {
      await upsertCurrentBatch(batchKey, batchDate, gaugeKey);
    } else if (oldStatus === 'current' && newStatus !== 'current') {
      await removeCurrentBatch(batchKey, gaugeKey);
    }

    // ── `previous_batches` — snapshot written once, never updated ───────────

    if (newStatus === 'previous') {
      // upsertPreviousBatch internally checks if snapshot already exists
      // and skips the write if it does — preserving the original archived state
      await upsertPreviousBatch(batchKey, batchDate, gaugeKey, snapshot);
    } else if (oldStatus === 'previous' && newStatus !== 'previous') {
      await removePreviousBatch(batchKey, gaugeKey);
    }

    // ── key removed from map — clean up current/previous ────────────────────

    if (!keyStillExists) {
      if (oldStatus === 'current') await removeCurrentBatch(batchKey, gaugeKey);
      if (oldStatus === 'previous') await removePreviousBatch(batchKey, gaugeKey);
    }
  }

  console.log(`[syncBatchCollections] done for gauge ${gaugeKey}`);
}

module.exports = {
  computeBatchKeys,
  computeGaugeDates,
  computeGaugeStatus,
  syncBatchCollections,
};
