const mongoose = require('mongoose');

const BatchSnapshotSchema = new mongoose.Schema(
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

const BatchGaugeKeySchema = new mongoose.Schema(
  {
    gauge_key: { type: String, required: true, trim: true },
    status: { type: String, enum: ['current', 'previous', null], default: null },
  },
  { _id: false },
);

const BatchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    gauge_keys: { type: [BatchGaugeKeySchema], default: [] },
    gauge_count: { type: Number, default: 0 },
    risk_summary: {
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
    batch_risk: { type: Number, default: 0 },
    batch_status: { type: String, enum: ['current', 'previous', 'upcoming', null], default: null },
    generated_at: { type: Date, default: Date.now },
    archived_at: { type: Date, default: null },
    snapshot: { type: [BatchSnapshotSchema], default: [] },
  },
  { versionKey: false, collection: 'batches' },
);

module.exports = mongoose.model('Batch', BatchSchema);
