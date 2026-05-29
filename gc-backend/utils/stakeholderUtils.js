// Utility functions for normalizing and hydrating stakeholder data.

const mongoose = require('mongoose');
const User = require('../models/gauge/User');


// Normalization — converts raw payloads into DB-safe ObjectId references


function normalizeStakeholderList(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const userId = String(item?.user_id || item?._id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(userId)) return null;
      return { user_id: new mongoose.Types.ObjectId(userId) };
    })
    .filter(Boolean);
}

function normalizeStakeholdersPayload(payload) {
  return {
    operators: normalizeStakeholderList(payload?.operators || payload?.Operators),
    supervisors: normalizeStakeholderList(payload?.supervisors || payload?.Supervisors),
  };
}


// Hydration — resolves user_id references to full user objects


async function hydrateStakeholders(stakeholders = {}) {
  const allIds = [
    ...(stakeholders.operators || []).map((item) => String(item.user_id)),
    ...(stakeholders.supervisors || []).map((item) => String(item.user_id)),
  ].filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (!allIds.length) {
    return { operators: [], supervisors: [] };
  }

  const users = await User.find({ _id: { $in: allIds } }).lean();
  const userLookup = users.reduce((map, user) => {
    map.set(String(user._id), user);
    return map;
  }, new Map());

  const projectUsers = (items) =>
    (items || [])
      .map((item) => {
        const userId = String(item.user_id || '');
        const user = userLookup.get(userId);
        if (!user) return null;
        return {
          user_id: userId,
          name: user.name,
          email: user.email,
        };
      })
      .filter(Boolean);

  return {
    operators: projectUsers(stakeholders.operators),
    supervisors: projectUsers(stakeholders.supervisors),
  };
}

module.exports = {
  normalizeStakeholderList,
  normalizeStakeholdersPayload,
  hydrateStakeholders,
};
