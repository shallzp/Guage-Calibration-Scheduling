const mongoose = require('mongoose');

const CurrentBatchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    gauge_keys: { type: [String], default: [] }, // Store gauge keys for reference and refer status from gauge data
    gauge_count: { type: Number, default: 0 },
    risk_summary: {
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
    batch_risk: { type: Number, default: 0 },
    batch_type: { type: String, default: null },
    generated_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'current_batches' },
);

module.exports = mongoose.model('CurrentBatch', CurrentBatchSchema);
