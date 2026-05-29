const express = require('express');
const mongoose = require('mongoose');

const Batch = require('../models/gauge/Batch');
const Gauge = require('../models/gauge/Gauge');

const { buildSnapshotFromGauge } = require('../utils/batchUtils');

const router = express.Router();

// Helper — access a raw MongoDB collection via the Mongoose connection
function getCollection(name) {
  return mongoose.connection.db.collection(name);
}


// current batches — GET /api/batches/current
// returns all current batches with gauge_keys, gauge_count, risk_summary, generated_at

router.get('/current', async (req, res) => {
  try {
    const docs = await getCollection('current_batches')
      .find({}, {
        projection: { _id: 1, date: 1, gauge_count: 1, batch_risk: 1, risk_summary: 1, guage_summary: 1, gauge_keys: 1 },
      })
      .toArray();

    return res.json(docs);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// previous batches — GET /api/batches/previous
// returns all previous batches with gauge_keys, gauge_count, risk_summary, generated_at, archived_at, snapshot

router.get('/previous', async (req, res) => {
  try {
    const docs = await getCollection('previous_batches')
      .find({}, {
        projection: {
          _id: 1,
          gauge_keys: 1,
          gauge_count: 1,
          risk_summary: 1,
          generated_at: 1,
          archived_at: 1,
          snapshot: 1,
        },
      })
      .toArray();

    return res.json(docs);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// unified batches — POST /api/batches/:batchKey
// updates any provided fields except _id and date (no deletes)
router.post('/:batchKey', async (req, res) => {
  try {
    const batchKey = decodeURIComponent(String(req.params.batchKey || '').trim());
    if (!batchKey) {
      return res.status(400).json({ message: 'batchKey path param is required.' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const snapshotGaugeKey = String(payload.refresh_snapshot_for_gauge || '').trim();
    const update = {};

    for (const [key, value] of Object.entries(payload)) {
      if (key === '_id' || key === 'date') continue;
      if (key === 'refresh_snapshot_for_gauge') continue;
      if (key.startsWith('$')) {
        return res.status(400).json({ message: 'Update operators are not allowed.' });
      }
      if (typeof value === 'undefined') continue;
      update[key] = value;
    }

    const batchExists = await Batch.findById(batchKey).lean();
    if (!batchExists) {
      return res.status(404).json({ message: 'Batch not found.' });
    }

    if (snapshotGaugeKey) {
      const gauge = await Gauge.findOne({ gauge_key: snapshotGaugeKey }).lean();
      if (!gauge) {
        return res.status(404).json({ message: 'Gauge not found.' });
      }

      const snapshot = buildSnapshotFromGauge(gauge);
      if (snapshot) {
        const updateResult = await Batch.updateOne(
          { _id: batchKey, 'snapshot.gauge_key': snapshotGaugeKey },
          { $set: { 'snapshot.$': snapshot } },
        );

        if (!updateResult.matchedCount) {
          await Batch.updateOne(
            { _id: batchKey },
            { $push: { snapshot } },
          );
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await Batch.findByIdAndUpdate(
        batchKey,
        { $set: update },
        { runValidators: true },
      );
    }

    const updated = await Batch.findById(batchKey).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Batch not found.' });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
