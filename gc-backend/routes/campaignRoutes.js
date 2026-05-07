const express = require('express');
const Campaign = require('../models/campaign/Campaign');
const PartsDispatch = require('../models/campaign/PartsDispatch');

const router = express.Router();

router.get('/campaign', async (req, res) => {
  try {
    const campaigns = await Campaign.find({}).lean();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parts-dispatch', async (req, res) => {
  try {
    const partsDispatch = await PartsDispatch.find({}).lean();
    res.json(partsDispatch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
