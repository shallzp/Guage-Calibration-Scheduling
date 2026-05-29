const mongoose = require('mongoose');

const BatchSnapshotSchema = new mongoose.Schema(
  {
    // ── identity ─────────────────────────────────────────────────────────────
    gauge_key:            { type: String, required: true, trim: true },

    // ── from latest_prediction ───────────────────────────────────────────────
    risk_score:           Number,
    risk_level:           String,
    action:               String,
    reason:               String,
    recommended_frequency:Number,
    recommended_due_date: Date,

    // ── from ml_features ────────────────────────────────────────────────────
    days_until_due:       Number,
    days_overdue:         Number,   // derived: abs(days_until_due) when overdue
    is_overdue:           Number,   // 0 or 1
    overdue_count:        Number,
    completion_rate:      Number,
    avg_delay_days:       Number,
    max_delay_days:       Number,
    predicted_overrun:    Number,
    history_size:         Number,
    frequency_at_batch:   Number,   // from gauge.frequency (months)
  },
  { _id: false },
);

const BatchGaugeKeySchema = new mongoose.Schema(
  {
    gauge_key: { type: String, required: true, trim: true },
    status:    { type: String, enum: ['current', 'previous', null], default: null },
  },
  { _id: false },
);

const BatchSchema = new mongoose.Schema(
  {
    _id:          { type: String, required: true, trim: true },
    date:         { type: Date, required: true },
    gauge_keys:   { type: [BatchGaugeKeySchema], default: [] },
    gauge_count:  { type: Number, default: 0 },
    risk_summary: {
      high:   { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low:    { type: Number, default: 0 },
    },
    batch_risk:   { type: Number, default: 0 },
    batch_status: {
      type: String,
      enum: ['current', 'previous', 'upcoming', null],
      default: null,
    },
    generated_at: { type: Date, default: Date.now },
    archived_at:  { type: Date, default: null },
    snapshot:     { type: [BatchSnapshotSchema], default: [] },
  },
  { versionKey: false, collection: 'batches' },
);

module.exports = mongoose.model('Batch', BatchSchema);
