const mongoose = require('mongoose');

/**
 * Petty Cash Wallet module (expense enhancement).
 * All money is stored in integer paise to avoid floating-point drift.
 *   PettyCashWallet         one per employee per company (unique)
 *   PettyCashTransaction    append-only ledger; every balance change has exactly one row
 *   PettyCashRequest        employee request for additional petty cash
 *   PettyCashReturnRequest  employee request to return excess petty cash above Base Limit
 */
const { ObjectId } = mongoose.Schema.Types;
const intPaise = { type: Number, default: 0, validate: { validator: Number.isInteger, message: 'Amount must be integer paise' } };

const walletSchema = new mongoose.Schema({
  companyId: { type: ObjectId, ref: 'Company', required: true },
  employeeId: { type: ObjectId, ref: 'User', required: true },
  baseLimitPaise: intPaise,
  balancePaise: intPaise,
  totalAllocationPaise: intPaise,
  totalReturnPaise: intPaise,
  totalCreditPaise: intPaise,
  totalDebitPaise: intPaise,
  currency: { type: String, default: 'INR' },
  // D6: only employees switched on by Accounts are debited on claim submission.
  enabled: { type: Boolean, default: false },
  enabledAt: { type: Date, default: null },
  enabledBy: { type: ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['ACTIVE', 'FROZEN'], default: 'ACTIVE' },
}, { timestamps: true });
walletSchema.index({ companyId: 1, employeeId: 1 }, { unique: true });
walletSchema.index({ companyId: 1, balancePaise: 1 });

const TXN_TYPES = ['CREDIT', 'DEBIT', 'ADJUSTMENT', 'REVERSAL'];
const TXN_SOURCES = [
  'CLAIM_SUBMIT',
  'CLAIM_EDIT',
  'CLAIM_REJECT',
  'CLAIM_DELETE',
  'CLAIM_PAYMENT',
  'TOPUP',
  'TOPUP_REQUEST',
  'ALLOCATION_ADJUSTMENT',
  'PETTY_CASH_RETURN',
  'MANUAL',
  'REVERSAL',
];
const TXN_CATEGORIES = [
  'INITIAL_ALLOCATION',
  'ALLOCATION_ENHANCEMENT',
  'ALLOCATION_ADJUSTMENT',
  'EXPENSE_DEDUCTION',
  'CLAIM_SETTLEMENT',
  'PETTY_CASH_RETURN',
  'REVERSAL',
  'OTHER_ADJUSTMENT',
];
const RETURN_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED'];

const transactionSchema = new mongoose.Schema({
  companyId: { type: ObjectId, ref: 'Company', required: true },
  walletId: { type: ObjectId, ref: 'PettyCashWallet', required: true },
  employeeId: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, enum: TXN_TYPES, required: true },
  direction: { type: String, enum: ['CR', 'DR'], required: true },
  source: { type: String, enum: TXN_SOURCES, required: true },
  transactionCategory: { type: String, enum: TXN_CATEGORIES, default: 'OTHER_ADJUSTMENT', index: true },
  amountPaise: { ...intPaise, min: 1, required: true },
  baseLimitBeforePaise: { ...intPaise, default: 0 },
  baseLimitAfterPaise: { ...intPaise, default: 0 },
  balanceBeforePaise: { ...intPaise, required: true },
  balanceAfterPaise: { ...intPaise, required: true },
  claimId: { type: ObjectId, ref: 'ExpenseClaim', default: null },
  claimNumber: { type: String, default: '' },
  paymentReference: { type: String, default: '' },
  requestId: { type: ObjectId, ref: 'PettyCashRequest', default: null },
  returnRequestId: { type: ObjectId, ref: 'PettyCashReturnRequest', default: null },
  reversalOf: { type: ObjectId, ref: 'PettyCashTransaction', default: null },
  reversedBy: { type: ObjectId, ref: 'PettyCashTransaction', default: null },
  idempotencyKey: { type: String, required: true },
  description: { type: String, default: '' },
  remarks: { type: String, default: '' },
  performedBy: { type: ObjectId, ref: 'User', default: null },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: 'SYSTEM' },
}, { timestamps: { createdAt: true, updatedAt: false } });
transactionSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true });
transactionSchema.index({ walletId: 1, createdAt: -1 });
transactionSchema.index({ companyId: 1, claimId: 1 });
transactionSchema.index({ companyId: 1, type: 1, createdAt: -1 });

// Ledger is append-only: only `reversedBy` may be set (once) on an existing row.
const blockMutation = function (next) {
  const upd = this.getUpdate ? this.getUpdate() : null;
  const keys = upd ? Object.keys({ ...(upd.$set || {}), ...Object.fromEntries(Object.entries(upd).filter(([k]) => !k.startsWith('$'))) }) : [];
  if (keys.length && keys.every((k) => k === 'reversedBy')) return next();
  next(new Error('Petty cash ledger entries cannot be modified or deleted.'));
};
['updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'].forEach((op) =>
  transactionSchema.pre(op, function (next) { next(new Error('Petty cash ledger entries cannot be modified or deleted.')); }));
['updateOne', 'findOneAndUpdate'].forEach((op) => transactionSchema.pre(op, blockMutation));

const requestSchema = new mongoose.Schema({
  companyId: { type: ObjectId, ref: 'Company', required: true },
  employeeId: { type: ObjectId, ref: 'User', required: true },
  requestedAmountPaise: { ...intPaise, min: 1, required: true },
  approvedAmountPaise: intPaise,
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['PENDING', 'REJECTED', 'FULFILLED'], default: 'PENDING' },
  reviewedBy: { type: ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  creditedAt: { type: Date, default: null },
  creditTxnId: { type: ObjectId, ref: 'PettyCashTransaction', default: null },
  remarks: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });
requestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
requestSchema.index({ employeeId: 1, createdAt: -1 });

const returnRequestSchema = new mongoose.Schema({
  companyId: { type: ObjectId, ref: 'Company', required: true },
  walletId: { type: ObjectId, ref: 'PettyCashWallet', default: null },
  employeeId: { type: ObjectId, ref: 'User', required: true },
  requestedAmountPaise: { ...intPaise, min: 1, required: true },
  approvedAmountPaise: intPaise,
  processedAmountPaise: intPaise,
  reason: { type: String, default: '', trim: true, maxlength: 500 },
  remarks: { type: String, default: '', trim: true, maxlength: 500 },
  attachments: [{ type: String }],
  status: { type: String, enum: RETURN_REQUEST_STATUSES, default: 'PENDING' },
  reviewedBy: { type: ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  reviewRemarks: { type: String, default: '', maxlength: 500 },
  processedBy: { type: ObjectId, ref: 'User', default: null },
  processedByName: { type: String, default: '' },
  processedAt: { type: Date, default: null },
  paymentReference: { type: String, default: '' },
  transactionId: { type: ObjectId, ref: 'PettyCashTransaction', default: null },
}, { timestamps: true });
returnRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
returnRequestSchema.index({ employeeId: 1, createdAt: -1 });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
module.exports = {
  PettyCashWallet: model('PettyCashWallet', walletSchema),
  PettyCashTransaction: model('PettyCashTransaction', transactionSchema),
  PettyCashRequest: model('PettyCashRequest', requestSchema),
  PettyCashReturnRequest: model('PettyCashReturnRequest', returnRequestSchema),
  TXN_TYPES,
  TXN_SOURCES,
  TXN_CATEGORIES,
  RETURN_REQUEST_STATUSES,
};

