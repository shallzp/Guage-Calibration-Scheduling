const mongoose = require('mongoose');
const { parseDateValue } = require('./gaugeUtils');

function normalizeObjectId(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return new mongoose.Types.ObjectId(value);
  if (value.$oid) return new mongoose.Types.ObjectId(value.$oid);
  return value;
}

function toCampaignDocument(record) {
  const sanitized = {
    ...record,
    'Start Date': parseDateValue(record['Start Date']),
    'End Date': parseDateValue(record['End Date']),
    'Job Card Created Date': parseDateValue(record['Job Card Created Date']),
    'Claim Date': parseDateValue(record['Claim Date']),
  };

  // Clean up fields that should be strings or null (not empty objects)
  const stringFields = ['Culprit Desc.', 'Part Desc.', 'Job Card Number', 'Claim Number'];
  stringFields.forEach(field => {
    const value = sanitized[field];
    // Convert empty objects or invalid values to null
    if (value && typeof value === 'object' && Object.keys(value).length === 0) {
      sanitized[field] = null;
    }
  });

  return sanitized;
}

function toUserDocument(record) {
  return {
    ...record,
    _id: normalizeObjectId(record._id),
  };
}

function toGaugeDocument(record) {
  return {
    ...record,
    due_date: parseDateValue(record.due_date),
    last_completion_date: parseDateValue(record.last_completion_date),
    stakeholders: {
      operators: (record.stakeholders?.operators || []).map((item) => ({
        user_id: normalizeObjectId(item.user_id),
      })),
      supervisors: (record.stakeholders?.supervisors || []).map((item) => ({
        user_id: normalizeObjectId(item.user_id),
      })),
    },
    schedule_table: (record.schedule_table || []).map((row) => ({
      ...row,
      due_date: parseDateValue(row.due_date),
      completion_date: parseDateValue(row.completion_date),
      reminder_at: parseDateValue(row.reminder_at),
      escalation_at: parseDateValue(row.escalation_at),
    }))
  };
}

function toCurrentBatchDocument(record) {
  return {
    ...record,
    date: parseDateValue(record.date),
    generated_at: parseDateValue(record.generated_at),
  };
}

function toPreviousBatchDocument(record) {
  return {
    ...record,
    date: parseDateValue(record.date),
    generated_at: parseDateValue(record.generated_at),
    archived_at: parseDateValue(record.archived_at),
    snapshot: (record.snapshot || []).map((row) => ({
      ...row,
      recommended_due_date: parseDateValue(row.recommended_due_date),
    })),
  };
}

module.exports = {
  normalizeObjectId,
  toCampaignDocument,
  toUserDocument,
  toGaugeDocument,
  toCurrentBatchDocument,
  toPreviousBatchDocument,
};
