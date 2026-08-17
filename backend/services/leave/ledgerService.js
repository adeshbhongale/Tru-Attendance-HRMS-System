const LeaveLedger = require('../../models/LeaveLedger');

// ── Ledger engine ────────────────────────────────────────────────────────────
// All movements flow through postEntry. Compute a working balance by summing
// entries chronologically. Used = absolute sum of APPROVE/ENCASH entries.
// CANCEL credits back the consumption of an approved leave so cancelling a
// previously approved leave restores the balance. Pending/rejected leaves
// never touch the ledger (they never reduce used).

exports.GRANT = 'GRANT';
exports.APPROVE = 'APPROVE';
exports.CANCEL = 'CANCEL';
exports.ADJUST = 'ADJUST';
exports.ENCASH = 'ENCASH';

const orderFrom = (periodKey) => {
  // GRANT/ADJUST open the balance; APPROVE/ENCASH consume; CANCEL closes.
  return periodKey || '';
};

exports.postEntry = async ({
  companyId,
  userId,
  leaveTypeRef,
  periodKey,
  entryType,
  quantity,
  sourceRef = null,
  note = '',
}) => {
  if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
    throw new Error('Ledger quantity must be a number');
  }

  // Working balance before this entry (chronological order).
  const prior = await LeaveLedger.find({ companyId, userId, leaveTypeRef, periodKey })
    .sort('createdAt _id')
    .lean();
  const balanceBefore = prior.reduce((acc, e) => acc + e.quantity, 0);
  const balanceAfter = balanceBefore + quantity;

  return LeaveLedger.create({
    companyId,
    userId,
    leaveTypeRef,
    periodKey,
    entryType,
    quantity,
    balanceAfter,
    sourceRef,
    note,
  });
};

// Compute the working balance components for an employee + leave type + period.
exports.summarize = async (companyId, userId, leaveTypeRef, periodKey) => {
  const entries = await LeaveLedger.find({ companyId, userId, leaveTypeRef, periodKey })
    .sort('createdAt _id')
    .lean();

  const byType = {
    GRANT: 0,
    APPROVE: 0,
    CANCEL: 0,
    ADJUST: 0,
    ENCASH: 0,
  };
  let balance = 0;

  entries.forEach((e) => {
    byType[e.entryType] = (byType[e.entryType] || 0) + e.quantity;
    balance += e.quantity;
  });

  // Used = net consumption from approved leaves (APPROVE entries).
  const used = Math.abs(byType.APPROVE);
  return {
    entries,
    granted: byType.GRANT,
    adjusted: byType.ADJUST,
    used,
    encashed: Math.abs(byType.ENCASH),
    cancelled: Math.abs(byType.CANCEL),
    balance: Math.max(0, balance),
  };
};

exports.entriesForUser = async (companyId, userId, periodKey) => {
  const filter = { companyId, userId };
  if (periodKey) filter.periodKey = periodKey;
  return LeaveLedger.find(filter).sort('createdAt _id').lean();
};

exports.entriesFor = async (filter) => {
  return LeaveLedger.find(filter || {}).sort('-createdAt').lean();
};