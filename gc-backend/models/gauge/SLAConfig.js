const mongoose = require('mongoose');

const SLAConfigSchema = new mongoose.Schema(
  {
    reminderNotStartedHours: { type: Number, default: 72, min: 1 },
    reminderOverdueIntervalHours: { type: Number, default: 48, min: 1 },
    escalationNotStartedInitialHours: { type: Number, default: 24, min: 1 },
    escalationNotStartedIntervalHours: { type: Number, default: 48, min: 1 },
    escalationOverdueInitialHours: { type: Number, default: 24, min: 1 },
    escalationOverdueIntervalHours: { type: Number, default: 48, min: 1 },
    version: { type: Number, default: 1, min: 1 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

module.exports = mongoose.model('SLAConfig', SLAConfigSchema);
