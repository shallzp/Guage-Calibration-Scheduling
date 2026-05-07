const express = require('express');
const router = express.Router();
const User = require('../models/gauge/User');

// fetch all available users for stakeholder assignment
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
