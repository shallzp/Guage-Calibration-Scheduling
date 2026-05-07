const express = require('express');
const mongoose = require('mongoose');

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
        projection: { _id: 1, date: 1, gauge_count: 1, batch_risk: 1, batch_type: 1, risk_summary: 1, gauge_keys: 1 },
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

module.exports = router;
