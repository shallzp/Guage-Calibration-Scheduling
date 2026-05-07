const express = require('express');
const SLAConfig = require('../models/gauge/SLAConfig');

const router = express.Router();

// The 6 configurable SLA fields — version is auto-incremented, not user-settable
const SLA_FIELDS = new Set([
  'reminderNotStartedHours',
  'reminderOverdueIntervalHours',
  'escalationNotStartedInitialHours',
  'escalationNotStartedIntervalHours',
  'escalationOverdueInitialHours',
  'escalationOverdueIntervalHours',
]);

// get current SLA config, auto-creating with schema defaults if none exists
router.get('/', async (req, res) => {
  try {
    const config = await SLAConfig.findOneAndUpdate(
      {},
      {},
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, lean: true },
    );
    return res.json(config);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// update SLA config fields (version is auto-incremented)
router.put('/', async (req, res) => {
  try {
    const patch = {};
    for (const key of SLA_FIELDS) {
      if (!(key in (req.body || {}))) continue;
      const value = Number(req.body[key]);
      if (Number.isFinite(value) && value > 0) patch[key] = value;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No valid SLA config fields provided.' });
    }

    const updated = await SLAConfig.findOneAndUpdate(
      {},
      { $set: patch, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true, lean: true },
    );

    if (!updated) {
      return res.status(404).json({ message: 'SLA config not found.' });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
