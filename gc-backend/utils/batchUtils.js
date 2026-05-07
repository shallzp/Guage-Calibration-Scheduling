const CurrentBatch = require('../models/gauge/CurrentBatch');
const PreviousBatch = require('../models/gauge/PreviousBatch');

/**
 * Derives the batch_keys map from the current schedule_table.
 *
 * Rules (rows sorted by schedule_id ascending):
 *   - completed rows                        → 'previous'
 *   - first non-completed row after last    → 'current'
 *   - all remaining rows                    → null (upcoming)
 */
function computeBatchKeys(scheduleRows) {
  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0) return {};

  const sorted = [...scheduleRows].sort((a, b) => Number(a.schedule_id) - Number(b.schedule_id));

  // Index of the last completed row (-1 if none)
  let lastCompletedIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === 'completed') { lastCompletedIdx = i; break; }
  }
  const currentIdx = lastCompletedIdx + 1; // first non-completed row (may equal sorted.length)

  const batchKeys = {};
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (!row.due_date) continue;
    const date = new Date(row.due_date);
    if (isNaN(date)) continue;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const key = `BATCH-${y}${m}${d}`;
    if (i <= lastCompletedIdx) batchKeys[key] = 'previous';
    else if (i === currentIdx)  batchKeys[key] = 'current';
    else                        batchKeys[key] = null;
  }
  return batchKeys;
}

/**
 * Computes root due_date and last_completion_date from schedule_table.
 */
function computeGaugeDates(scheduleRows) {
  let due_date = null;
  let last_completion_date = null;

  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0) {
    return { due_date, last_completion_date };
  }

  const sorted = [...scheduleRows].sort((a, b) => Number(a.schedule_id) - Number(b.schedule_id));

  let lastCompletedIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === 'completed') { lastCompletedIdx = i; break; }
  }
  const currentIdx = lastCompletedIdx + 1;

  if (lastCompletedIdx >= 0) {
    last_completion_date = sorted[lastCompletedIdx].completion_date || sorted[lastCompletedIdx].due_date || null;
  }

  if (currentIdx < sorted.length) {
    due_date = sorted[currentIdx].due_date || null;
  }

  return { due_date, last_completion_date };
}

/**
 * Derives the top-level gauge status from schedule_table.
 *
 * Rules (rows sorted by schedule_id ascending):
 *   - status of the row immediately after last completed  → that row's status
 *   - no row after last completed                         → 'completed'
 *   - no completed row at all                             → first row's status
 */
function computeGaugeStatus(scheduleRows) {
  if (!Array.isArray(scheduleRows) || scheduleRows.length === 0) return null;

  const sorted = [...scheduleRows].sort((a, b) => Number(a.schedule_id) - Number(b.schedule_id));

  let lastCompletedIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === 'completed') { lastCompletedIdx = i; break; }
  }

  if (lastCompletedIdx === -1) return sorted[0].status;          // no completed row
  const nextIdx = lastCompletedIdx + 1;
  if (nextIdx >= sorted.length) return 'completed';              // nothing after last completed
  return sorted[nextIdx].status;                                 // next row's status
}

/**
 * Rules:
 *   - key status null→'current'       : add gauge_key to current_batches (upsert)
 *   - key status 'current'→'previous' : remove from current_batches, add to previous_batches (if doc exists)
 *   - key status *→null or removed    : remove from current_batches (if was current)
 *   - key status 'previous'→*         : remove from previous_batches (if was previous)
 * 
 * 
 * Diffs oldBatchKeys vs newBatchKeys and fires the minimal set of ops
 * to keep current_batches and previous_batches in sync.
 *
 * Handles old array-format batch_keys (before schema migration) by treating
 * every key in the array as status=null (unknown / upcoming).
 */
async function syncBatchCollections(gaugeKey, oldMap, newMap) {
  // Normalise oldMap — handles three possible shapes:
  //   Map instance (Mongoose in-memory), plain object (lean()), old array format
  let oldKeys = {};
  if (oldMap instanceof Map) {
    oldKeys = Object.fromEntries(oldMap);
  } else if (Array.isArray(oldMap)) {
    // Legacy: array of batch key strings — treat all as null (status unknown)
    for (const key of oldMap) {
      if (typeof key === 'string') oldKeys[key] = null;
    }
  } else if (oldMap && typeof oldMap === 'object') {
    oldKeys = oldMap;
  }

  const newKeys = (newMap && typeof newMap === 'object' && !Array.isArray(newMap))
    ? newMap
    : {};

  // Collect all batch keys that appear in either map
  const allKeys = new Set([...Object.keys(oldKeys), ...Object.keys(newKeys)]);

  const ops = [];

  for (const batchKey of allKeys) {
    const oldStatus = oldKeys[batchKey] ?? null;
    const newStatus = newKeys[batchKey] ?? null;

    if (oldStatus === newStatus) continue; // nothing changed for this key

    // Derive a Date from the batch key "BATCH-YYYYMMDD" for upsert
    const dateStr = batchKey.replace('BATCH-', '');
    const batchDate = new Date(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
    );

    // ── current_batches ──────────────────────────────────────────────────
    if (newStatus === 'current') {
      // Became current: upsert current_batches document, add gauge_key
      ops.push(
        CurrentBatch.findByIdAndUpdate(
          batchKey,
          {
            $setOnInsert: { _id: batchKey, date: batchDate },
            $addToSet: { gauge_keys: gaugeKey },
          },
          { upsert: true },
        ).then(() =>
          // Recount after addToSet so gauge_count stays accurate
          CurrentBatch.findByIdAndUpdate(batchKey, [
            { $set: { gauge_count: { $size: '$gauge_keys' } } },
          ], { updatePipeline: true }),
        ),
      );
    } else if (oldStatus === 'current') {
      // Was current, no longer: remove from current_batches
      // If this was the last gauge in the batch, delete the batch doc entirely
      ops.push(
        CurrentBatch.findByIdAndUpdate(batchKey, {
          $pull: { gauge_keys: gaugeKey },
        }, { returnDocument: 'after' }).then((updated) => {
          if (!updated) return;
          if (updated.gauge_keys.length === 0) {
            // Batch is now empty — delete it
            return CurrentBatch.findByIdAndDelete(batchKey);
          }
          // Still has gauges — recount
          return CurrentBatch.findByIdAndUpdate(batchKey, [
            { $set: { gauge_count: { $size: '$gauge_keys' } } },
          ], { updatePipeline: true });
        }),
      );
    }

    // ── previous_batches ─────────────────────────────────────────────────
    if (newStatus === 'previous') {
      // Became previous: upsert the previous_batch doc if it doesn't exist yet,
      // then add gauge_key to it
      ops.push(
        PreviousBatch.findByIdAndUpdate(
          batchKey,
          {
            $setOnInsert: { _id: batchKey, date: batchDate, generated_at: new Date(), archived_at: new Date() },
            $addToSet: { gauge_keys: gaugeKey },
          },
          { upsert: true, returnDocument: 'after' },
        ).then(() =>
          PreviousBatch.findByIdAndUpdate(batchKey, [
            { $set: { gauge_count: { $size: '$gauge_keys' } } },
          ], { updatePipeline: true }),
        ),
      );
    } else if (oldStatus === 'previous') {
      // Was previous, no longer: remove from previous_batches
      // If this was the last gauge in the batch, delete the batch doc entirely
      ops.push(
        PreviousBatch.findByIdAndUpdate(batchKey, {
          $pull: { gauge_keys: gaugeKey },
        }, { returnDocument: 'after' }).then((updated) => {
          if (!updated) return;
          if (updated.gauge_keys.length === 0) {
            // Batch is now empty — delete it
            return PreviousBatch.findByIdAndDelete(batchKey);
          }
          // Still has gauges — recount
          return PreviousBatch.findByIdAndUpdate(batchKey, [
            { $set: { gauge_count: { $size: '$gauge_keys' } } },
          ], { updatePipeline: true });
        }),
      );
    }
  }

  if (ops.length > 0) {
    console.log(`[syncBatchCollections] ${ops.length} op(s) for gauge ${gaugeKey}`);
    await Promise.all(ops);
    console.log(`[syncBatchCollections] done for gauge ${gaugeKey}`);
  } else {
    console.log(`[syncBatchCollections] no changes detected for gauge ${gaugeKey}`);
  }
}

module.exports = {
  computeBatchKeys,
  computeGaugeDates,
  computeGaugeStatus,
  syncBatchCollections,
};
