const mongoose = require('mongoose');

const BatchSnapshotSchema = new mongoose.Schema(
  {
    gauge_key: { type: String, required: true, trim: true },
    status: { type: String, enum: ['overdue', 'completed', 'in-progress', 'not-started'] },
    risk_score: Number,
    risk_level: String,
    action: String,
    recommended_frequency: Number,
    recommended_due_date: Date,
  },
  { _id: false },
);

const BatchSchema = new mongoose.Schema(
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
    batch_risk: { type: Number, default: 0 },
    batch_type: { type: String, enum: ['healthy', 'problematic'], default: null },
    batch_status: { type: String, enum: ['current', 'previous', 'upcoming'], required: true },
    generated_at: { type: Date, default: Date.now },
    archived_at: { type: Date, default: null },
    snapshot: { type: [BatchSnapshotSchema], default: [] },
  },
  { versionKey: false, collection: 'batches' },
);

module.exports = mongoose.model('Batch', BatchSchema);