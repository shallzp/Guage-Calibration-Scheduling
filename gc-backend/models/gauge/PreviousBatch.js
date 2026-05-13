const mongoose = require('mongoose');

// Previous batch snapshot — written once at archival, never updated.
// completion_status is absent — all gauges here are completed by definition.
// Fields that require a live ML run (risk_score, risk_level, etc.) are stored
// but will be null for seed data; they are populated on first real archival.
const PreviousBatchSnapshotSchema = new mongoose.Schema(
  {
    // ── identity ─────────────────────────────────────────────────────────────
    gauge_key:            { type: String, required: true, trim: true },

    // ── from latest_prediction (null if no ML run at archival time) ──────────
    risk_score:           Number,
    risk_level:           String,
    action:               String,
    reason:               String,
    recommended_frequency:Number,
    recommended_due_date: Date,

    // ── from ml_features (null if no ML run at archival time) ────────────────
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

const PreviousBatchSchema = new mongoose.Schema(
  {
    _id:          { type: String, required: true, trim: true },
    date:         { type: Date, required: true },
    gauge_keys:   { type: [String], default: [] },
    gauge_count:  { type: Number, default: 0 },
    risk_summary: {
      high:   { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low:    { type: Number, default: 0 },
    },
    generated_at: { type: Date, default: Date.now },
    archived_at:  { type: Date, default: Date.now },
    snapshot:     { type: [PreviousBatchSnapshotSchema], default: [] },
  },
  { versionKey: false, collection: 'previous_batches' },
);

module.exports = mongoose.model('PreviousBatch', PreviousBatchSchema);
