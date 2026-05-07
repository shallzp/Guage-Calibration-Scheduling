const mongoose = require('mongoose');

const PreviousBatchSnapshotSchema = new mongoose.Schema(
  {
    gauge_key: { type: String, required: true, trim: true },
    risk_score: Number,
    risk_level: String,
    days_until_due: { type: Number, default: 0 },
    days_overdue: Number,
    completion_status: String,
    delay_days: Number,
    frequency_at_batch: Number,
  },
  { _id: false },
);

const PreviousBatchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    gauge_keys: { type: [String], default: [] },
    gauge_count: { type: Number, default: 0 },
    risk_summary: {
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
    generated_at: { type: Date, default: Date.now },
    archived_at: { type: Date, default: Date.now },
    snapshot: { type: [PreviousBatchSnapshotSchema], default: [] },
  },
  { versionKey: false, collection: 'previous_batches' },
);

module.exports = mongoose.model('PreviousBatch', PreviousBatchSchema);
