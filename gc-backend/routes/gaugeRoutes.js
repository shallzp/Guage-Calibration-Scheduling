const express = require('express');
const Gauge = require('../models/gauge/Gauge');

const { sanitizeGaugePatch, normalizeScheduleStatus, parseDateValue, deriveRowStatus, OVERDUE_THRESHOLD_DAYS } = require('../utils/gaugeUtils');

const { normalizeStakeholdersPayload, hydrateStakeholders } = require('../utils/stakeholderUtils');
const { computeRiskSummary } = require('../utils/riskUtils');
const { computeBatchKeys, computeGaugeDates, computeGaugeStatus, syncBatchCollections } = require('../utils/batchUtils');

const router = express.Router();


// overdue recalculation

/**
 * Called once on app load (from App.jsx before gauges are fetched).
 *
 * Automatic status transitions applied by this job:
 *
 *   'not-started' → 'overdue'     if due_date + OVERDUE_THRESHOLD_DAYS <= today
 *                   (skipped for in-progress — that transition is manual-only)
 *
 *   'in-progress' → 'overdue'     if due_date + OVERDUE_THRESHOLD_DAYS <= today
 *
 *   'overdue'     → 'in-progress' if due_date was shifted forward and is no longer
 *                   past the threshold (never corrects back to 'not-started')
 *
 * NEVER touched automatically:
 *   'not-started' → 'in-progress' (manual only)
 *   'completed'   → anything      (never changed)
 *
 * Only gauges with at least one row that actually changed are written to DB.
 * Batch collections are synced for every gauge that was updated.
 */
router.post('/recalculate-overdue', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all gauges that have at least one non-completed row
    // (not-started, in-progress, and overdue rows are all included)
    const gauges = await Gauge.find({
      'schedule_table': {
        $elemMatch: { status: { $ne: 'completed' } },
      },
    }).lean();

    const results = { checked: gauges.length, updated: 0, skipped: 0, thresholdDays: OVERDUE_THRESHOLD_DAYS };

    for (const gauge of gauges) {
      const rows = Array.isArray(gauge.schedule_table) ? gauge.schedule_table : [];

      // Allowed automatic transitions:
      //   not-started → overdue     (threshold crossed; not-started → in-progress is manual)
      //   in-progress → overdue     (threshold crossed)
      //   overdue     → in-progress (wrongly overdue; due date shifted forward)
      //                              never corrects overdue back to 'not-started'
      const rowsToUpdate = rows
        .filter((row) => row.status === 'not-started' || row.status === 'in-progress' || row.status === 'overdue')
        .map((row) => {
          const derivedStatus = deriveRowStatus(row, today);
          if (!derivedStatus) return null; // invalid due_date — skip

          // Wrongly overdue: due date shifted forward, threshold no longer crossed
          if (row.status === 'overdue' && derivedStatus !== 'overdue') {
            return { row, correctStatus: 'in-progress' }; // always land on in-progress, not not-started
          }

          // Promote to overdue: threshold crossed for in-progress or not-started
          if (derivedStatus === 'overdue' && row.status !== 'overdue') {
            return { row, correctStatus: 'overdue' };
          }

          // not-started → in-progress is manual-only; skip all other no-change cases
          return null;
        })
        .filter(Boolean);

      if (rowsToUpdate.length === 0) {
        results.skipped++;
        continue;
      }

      // Single bulk update for all rows that need changing in this gauge
      const finalSetFields = {};
      const arrayFilters   = [];

      for (const { row, correctStatus } of rowsToUpdate) {
        const filterId = `row${row.schedule_id}`;
        finalSetFields[`schedule_table.$[${filterId}].status`] = correctStatus;
        arrayFilters.push({ [`${filterId}.schedule_id`]: row.schedule_id });
      }

      const afterUpdate = await Gauge.findOneAndUpdate(
        { gauge_key: gauge.gauge_key },
        { $set: finalSetFields },
        { returnDocument: 'after', arrayFilters },
      ).lean();

      if (!afterUpdate) continue;

      // Recompute derived gauge-level fields from the corrected schedule
      const batchKeys   = computeBatchKeys(afterUpdate.schedule_table);
      const gaugeDates  = computeGaugeDates(afterUpdate.schedule_table, batchKeys);
      const gaugeStatus = computeGaugeStatus(afterUpdate.schedule_table, batchKeys);

      await Gauge.findOneAndUpdate(
        { gauge_key: gauge.gauge_key },
        {
          $set: {
            batch_keys:           batchKeys,
            due_date:             gaugeDates.due_date,
            last_completion_date: gaugeDates.last_completion_date,
            status:               gaugeStatus,
          },
        },
      );

      // Sync batch collections — non-blocking, errors are logged not thrown
      syncBatchCollections(gauge.gauge_key, gauge.batch_keys, batchKeys).catch((err) =>
        console.error(`syncBatchCollections (recalculate-overdue) error for ${gauge.gauge_key}:`, err),
      );

      results.updated++;
    }

    console.log(
      `[recalculate-overdue] threshold=${OVERDUE_THRESHOLD_DAYS}d | checked: ${results.checked}, updated: ${results.updated}, skipped: ${results.skipped}`,
    );
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// get all gauges
router.get('/', async (req, res) => {
  try {
    const gauges = await Gauge.find({});
    res.json(gauges);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ***** stakeholders *****

// get stakeholders for a gauge
router.get('/stakeholders', async (req, res) => {
  try {
    const gaugeKey = String(req.query.gaugeKey || '').trim();
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey query param is required.' });
    }

    const gauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!gauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    const stakeholders = await hydrateStakeholders(gauge.stakeholders || {});
    return res.json(stakeholders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// update stakeholders for a gauge
router.put('/stakeholders', async (req, res) => {
  try {
    const gaugeKey = String(req.query.gaugeKey || '').trim();
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey query param is required.' });
    }

    const stakeholders = normalizeStakeholdersPayload(req.body || {});

    const updatedGauge = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      {
        $set: {
          stakeholders: {
            operators: stakeholders.operators,
            supervisors: stakeholders.supervisors,
          },
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    if (!updatedGauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    const hydrated = await hydrateStakeholders(updatedGauge.stakeholders || {});
    return res.json(hydrated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// ***** gauge by key operations *****

// get a single gauge by gauge_key
router.get('/:gaugeKey', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey path param is required.' });
    }

    const gauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!gauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    return res.json(gauge);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// update a gauge by gauge_key
router.patch('/:gaugeKey', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey path param is required.' });
    }

    const patch = sanitizeGaugePatch(req.body || {}, { normalizeStakeholdersPayload });
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: 'No allowed fields provided for update.' });
    }

    if (Array.isArray(patch.schedule_table) && patch.schedule_table.some((row) => !row.due_date)) {
      return res.status(400).json({ message: 'Each schedule row must include a valid due_date.' });
    }

    // Read existing gauge to get old batch_keys for batch collection sync if schedule is updated
    const existingGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!existingGauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    let updatedGauge = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      { $set: patch },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    // If schedule_table was updated, recompute batch_keys, gaugeDates, status and sync
    if (patch.schedule_table) {
      const batchKeys = computeBatchKeys(updatedGauge.schedule_table);
      const gaugeDates = computeGaugeDates(updatedGauge.schedule_table, batchKeys);
      const gaugeStatus = computeGaugeStatus(updatedGauge.schedule_table, batchKeys);

      updatedGauge = await Gauge.findOneAndUpdate(
        { gauge_key: gaugeKey },
        {
          $set: {
            batch_keys: batchKeys,
            due_date: gaugeDates.due_date,
            last_completion_date: gaugeDates.last_completion_date,
            status: gaugeStatus,
          }
        },
        { returnDocument: 'after' },
      ).lean();

      syncBatchCollections(gaugeKey, existingGauge.batch_keys, batchKeys).catch((err) =>
        console.error('syncBatchCollections (PATCH gauge) error:', err),
      );
    }

    return res.json(updatedGauge);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// ***** schedule table *****

// append a new schedule row to a gauge's schedule_table
router.post('/:gaugeKey/schedule', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey path param is required.' });
    }
 
    const gauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!gauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }
 
    const rows = Array.isArray(gauge.schedule_table) ? gauge.schedule_table : [];
    const frequency = Number(gauge.frequency) || 0;
 
    if (frequency <= 0) {
      return res.status(400).json({ message: 'Gauge frequency must be > 0 to append a schedule row.' });
    }
 
    // ── use client-supplied due_date when provided ───────────────────────────
    // The frontend always knows the correct next date (it may have shifted dates
    // in memory that haven't been persisted to the DB yet), so trust it.
    let nextDueDate = null;
    if (req.body?.due_date) {
      nextDueDate = parseDateValue(req.body.due_date);
    }
    if (!nextDueDate && rows.length > 0) {
      // Fallback: derive from the last existing row + frequency
      const lastDue = new Date(rows[rows.length - 1].due_date);
      lastDue.setMonth(lastDue.getMonth() + frequency);
      nextDueDate = lastDue;
    }
    if (!nextDueDate) {
      return res.status(400).json({ message: 'Could not determine a valid due_date. Please provide one.' });
    }
    // ────────────────────────────────────────────────────────────────────────
 
    const nextId = rows.length > 0
      ? Math.max(...rows.map((r) => Number(r.schedule_id) || 0)) + 1
      : 1;
 
    const newRow = {
      schedule_id: nextId,
      due_date: nextDueDate,
      completion_date: null,
      status: 'not-started',
    };
 
    const afterPush = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      { $push: { schedule_table: newRow } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
 
    const batchKeys = computeBatchKeys(afterPush.schedule_table);
    const gaugeDates = computeGaugeDates(afterPush.schedule_table, batchKeys);
    const gaugeStatus = computeGaugeStatus(afterPush.schedule_table, batchKeys);
    await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      {
        $set: {
          batch_keys: batchKeys,
          due_date: gaugeDates.due_date,
          last_completion_date: gaugeDates.last_completion_date,
          status: gaugeStatus,
        },
      },
      { returnDocument: 'after' },
    ).lean();
 
    syncBatchCollections(gaugeKey, gauge.batch_keys, batchKeys).catch((err) =>
      console.error('syncBatchCollections (POST schedule) error:', err),
    );
 
    try {
      await fetch(`http://127.0.0.1:8000/api/risk/gauge/${encodeURIComponent(gaugeKey)}/run`, {
        method: 'POST',
      });
    } catch (err) {
      console.error(`Failed to trigger ML risk recalculation for ${gaugeKey}:`, err);
    }
 
    const finalGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    return res.status(201).json(finalGauge);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// update a single schedule row (status, completion_date, and/or due_date)
router.patch('/:gaugeKey/schedule/:scheduleId', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    const scheduleId = Number(req.params.scheduleId);

    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey path param is required.' });
    }
    if (!Number.isFinite(scheduleId) || scheduleId < 1) {
      return res.status(400).json({ message: 'scheduleId must be a positive integer.' });
    }

    const { status, completion_date, due_date } = req.body || {};
    if (!status && due_date === undefined) {
      return res.status(400).json({ message: 'At least one of status or due_date is required.' });
    }


    // Read existing gauge to get old batch_keys for batch collection sync
    const existingGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!existingGauge) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    const existingRow = (existingGauge.schedule_table || []).find(
      (row) => Number(row.schedule_id) === scheduleId,
    );

    const setFields = {};

    if (status) {
      setFields['schedule_table.$[row].status'] = normalizeScheduleStatus(status);
      setFields['schedule_table.$[row].completion_date'] = parseDateValue(completion_date ?? null);
    }

    if (due_date !== undefined) {
      const parsedDueDate = parseDateValue(due_date);
      setFields['schedule_table.$[row].due_date'] = parsedDueDate;
    }

    // Apply status / due_date changes to the schedule row
    const afterUpdate = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      { $set: setFields },
      {
        returnDocument: 'after',
        runValidators: true,
        arrayFilters: [{ 'row.schedule_id': scheduleId }],
      },
    ).lean();

    if (!afterUpdate) {
      return res.status(404).json({ message: 'Gauge not found.' });
    }

    // Recompute the full batch_keys map, root dates and status from the updated schedule
    const batchKeys = computeBatchKeys(afterUpdate.schedule_table);
    const gaugeDates = computeGaugeDates(afterUpdate.schedule_table, batchKeys);
    const gaugeStatus = computeGaugeStatus(afterUpdate.schedule_table, batchKeys);
    const updated = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      {
        $set: {
          batch_keys: batchKeys,
          due_date: gaugeDates.due_date,
          last_completion_date: gaugeDates.last_completion_date,
          status: gaugeStatus,
        }
      },
      { returnDocument: 'after' },
    ).lean();

    // Sync current_batches / previous_batches based on what changed
    syncBatchCollections(gaugeKey, existingGauge.batch_keys, batchKeys).catch((err) =>
      console.error('syncBatchCollections (PATCH schedule) error:', err),
    );

    // Trigger fast ML recalculation for the specific gauge (includes batch risk updates)
    try {
      await fetch(`http://127.0.0.1:8000/api/risk/gauge/${encodeURIComponent(gaugeKey)}/run`, {
        method: 'POST',
      });
    } catch (err) {
      console.error(`Failed to trigger ML risk recalculation for ${gaugeKey}:`, err);
    }

    const finalGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    return res.json(finalGauge);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// bulk update schedule rows
router.patch('/:gaugeKey/schedule-bulk', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    if (!gaugeKey) return res.status(400).json({ message: 'gaugeKey path param is required.' });

    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      return res.status(400).json({ message: 'updates array is required.' });
    }

    const existingGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    if (!existingGauge) return res.status(404).json({ message: 'Gauge not found.' });

    let bulkSchedule = existingGauge.schedule_table || [];

    for (const update of updates) {
      const { scheduleId, due_date, status, completion_date } = update;
      const rowIdx = bulkSchedule.findIndex((r) => Number(r.schedule_id) === Number(scheduleId));
      if (rowIdx === -1) continue;
      
      if (status) bulkSchedule[rowIdx].status = normalizeScheduleStatus(status);
      if (completion_date !== undefined) bulkSchedule[rowIdx].completion_date = parseDateValue(completion_date);
      if (due_date !== undefined) bulkSchedule[rowIdx].due_date = parseDateValue(due_date);
    }

    const afterUpdate = await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      { $set: { schedule_table: bulkSchedule } },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    const batchKeys = computeBatchKeys(afterUpdate.schedule_table);
    const gaugeDates = computeGaugeDates(afterUpdate.schedule_table, batchKeys);
    const gaugeStatus = computeGaugeStatus(afterUpdate.schedule_table, batchKeys);

    await Gauge.findOneAndUpdate(
      { gauge_key: gaugeKey },
      {
        $set: {
          batch_keys: batchKeys,
          due_date: gaugeDates.due_date,
          last_completion_date: gaugeDates.last_completion_date,
          status: gaugeStatus,
        }
      }
    );

    syncBatchCollections(gaugeKey, existingGauge.batch_keys, batchKeys).catch((err) =>
      console.error('syncBatchCollections (PATCH schedule-bulk) error:', err),
    );

    try {
      await fetch(`http://127.0.0.1:8000/api/risk/gauge/${encodeURIComponent(gaugeKey)}/run`, { method: 'POST' });
    } catch (err) {}

    const finalGauge = await Gauge.findOne({ gauge_key: gaugeKey }).lean();
    return res.json(finalGauge);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// ***** risk data *****

// returns a summary of risk levels across all gauges, including counts and percentages for each risk level
router.get('/risk/summary', async (req, res) => {
  try {
    const gauges = await Gauge.find(
      { gauge_key: { $exists: true } },
      { 'latest_prediction.risk_level': 1, _id: 0 },
    ).lean();

    return res.json(computeRiskSummary(gauges));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// returns the risk score and level for a gauge identified by gauge_key
router.get('/risk/gauge/:gaugeKey', async (req, res) => {
  try {
    const gaugeKey = decodeURIComponent(String(req.params.gaugeKey || '').trim());
    if (!gaugeKey) {
      return res.status(400).json({ message: 'gaugeKey path param is required.' });
    }

    const gauge = await Gauge.findOne(
      { gauge_key: gaugeKey },
      {
        _id: 0,
        gauge_key: 1,
        gauge_id: 1,
        'latest_prediction.risk_score': 1,
        'latest_prediction.risk_level': 1,
      },
    ).lean();

    if (!gauge) {
      return res.status(404).json({ message: `Gauge not found: ${gaugeKey}` });
    }

    const prediction = gauge.latest_prediction || {};
    const resolvedKey = String(gauge.gauge_key || gauge.gauge_id || gaugeKey).trim();

    return res.json({
      gauge_key: resolvedKey,
      risk_score: prediction.risk_score ?? null,
      risk_level: prediction.risk_level ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
