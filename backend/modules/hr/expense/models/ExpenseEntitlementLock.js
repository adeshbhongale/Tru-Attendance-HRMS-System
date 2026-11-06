const mongoose = require('mongoose');

/**
 * Short-lived lease lock used to serialise entitlement-consuming submissions per employee
 * (e.g. two overlapping food claims submitted at the same moment). Works with and without
 * MongoDB transactions: the unique `key` makes acquisition atomic, `expiresAt` frees locks
 * left behind by a crashed request. The TTL index removes stale documents.
 */
const expenseEntitlementLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: false });

expenseEntitlementLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

module.exports = mongoose.models.ExpenseEntitlementLock
  || mongoose.model('ExpenseEntitlementLock', expenseEntitlementLockSchema);

