const mongoose = require('mongoose');

const StakeholderRefSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { _id: false },
);

const ScheduleRowSchema = new mongoose.Schema(
  {
    schedule_id: { type: Number, required: true },
    due_date: { type: Date, required: true },
    completion_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ['not-started', 'in-progress', 'completed', 'overdue'],
      default: 'not-started',
    },
    reminder_at: { type: Date, default: null },
    escalation_at: { type: Date, default: null },
  },
  { _id: false },
);

const GaugeSchema = new mongoose.Schema(
  {
    gauge_key: { type: String, required: true, unique: true, trim: true, index: true },
    gauge_id: { type: String, trim: true, default: '' },
    gauge_name: { type: String, trim: true, default: '' },
    gauge_type: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    status: { type: String, trim: true, default: '' },
    frequency: { type: Number, default: 0 },
    due_date: { type: Date, default: null },
    last_completion_date: { type: Date, default: null },
    stakeholders: {
      operators: { type: [StakeholderRefSchema], default: [] },
      supervisors: { type: [StakeholderRefSchema], default: [] },
    },
    schedule_table: { type: [ScheduleRowSchema], default: [] },
    ml_features: {
      // can be removed or anything more can be added
      days_until_due: Number,
      overdue_count: Number,
      completion_rate: Number,
      avg_delay_days: Number,
      frequency_months: Number,
      is_overdue: Number,
      next_due_date: { type: Date, default: null },
      max_delay_days: Number,
      history_size: Number,
      predicted_overrun: Number,
    },
    latest_prediction: {
      // can be removed or anything more can be added
      risk_score: Number,
      risk_level: String,
      action: String,
      reason: String,
      signals: [String],
      issue_type: String,
      recommended_frequency: Number,
      recommended_due_date: Date,
      scored_at: Date,
    },
    batch_keys: { type: Map, of: String, default: {} }, //enum of values : 'current', 'previous', null
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
);

module.exports = mongoose.model('Gauge', GaugeSchema);
