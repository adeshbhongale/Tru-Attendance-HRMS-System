const crypto = require('crypto');
const ExpenseEntitlementLock = require('../models/ExpenseEntitlementLock');

/**
 * Per-employee lease locks around entitlement-consuming submissions.
 *
 * withEmployeeLocks() acquires one lock per employee (sorted, so two requests never deadlock),
 * runs fn() — which must re-read consumption and recalculate — and always releases. While one
 * submission holds the lock, a concurrent overlapping submission waits and then recalculates
 * against the committed claim, so the same daily entitlement can never be reserved twice.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire(key, owner, ttlMs) {
  const now = new Date();
  try {
    await ExpenseEntitlementLock.findOneAndUpdate(
      { key, $or: [{ expiresAt: { $lt: now } }, { owner }] },
      { $set: { owner, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true }
    );
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false; // held by another live request
    throw err;
  }
}

async function withEmployeeLocks({ companyId, employeeIds, scope = 'FOOD', ttlMs = 20000, waitMs = 10000 }, fn) {
  const owner = crypto.randomBytes(12).toString('hex');
  const keys = [...new Set((employeeIds || []).map(String).filter(Boolean))]
    .sort()
    .map((id) => `${scope}:${companyId || '-'}:${id}`);
  const held = [];
  try {
    const deadline = Date.now() + waitMs;
    for (const key of keys) {
      // eslint-disable-next-line no-await-in-loop
      while (!(await acquire(key, owner, ttlMs))) {
        if (Date.now() > deadline) {
          const err = new Error('Another claim for the same employee is being submitted right now. Please retry in a moment.');
          err.status = 409;
          err.code = 'ENTITLEMENT_LOCKED';
          throw err;
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(60 + Math.floor(Math.random() * 60));
      }
      held.push(key);
    }
    return await fn();
  } finally {
    if (held.length) await ExpenseEntitlementLock.deleteMany({ key: { $in: held }, owner }).catch(() => {});
  }
}

module.exports = { withEmployeeLocks };

