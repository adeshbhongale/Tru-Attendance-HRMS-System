const mongoose = require('mongoose');
try { require('../../../../models/Company'); } catch (_) {}
try { require('../../../../models/User'); } catch (_) {}
const expenseItemSchema = require('./ExpenseItem');
const { attachmentSchema } = expenseItemSchema;

const employeeSnapshotSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, default: '' },
  employeeIdCode: { type: String, default: '' },
  department: { type: String, default: '' },
  levelName: { type: String, default: '' },
  levelNumber: { type: Number, default: null },
  levelRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Level', default: null },
  gradeCode: { type: String, default: '' },
  gradeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', default: null },
  role: { type: String, default: '' },
}, { _id: false });

const employeeClaimSchema = new mongoose.Schema({
  employee: employeeSnapshotSchema,
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [expenseItemSchema],
  // Totals for this employee
  requestedTotal: { type: Number, default: 0 },
  allowedTotal: { type: Number, default: 0 },
  excessTotal: { type: Number, default: 0 },
  // Per-employee calculations summary
  itemCount: { type: Number, default: 0 },
}, { _id: true });

const approvalEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: String,
  action: { type: String, enum: ['approved', 'rejected', 'returned', 'disbursed', 'paid', 'reopened'], default: 'approved' },
  timestamp: { type: Date, default: Date.now },
  remarks: { type: String, default: '' },
}, { _id: false });

const timelineEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  description: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

// "Full Payment" = employee asks for the FULL requested amount (not just the policy
// allowed amount), backed by a reason + approval proof. Only becomes payable after
// an authorised approver (never someone on the claim) approves it.
const fullPaymentSchema = new mongoose.Schema({
  requested: { type: Boolean, default: false },
  reason: { type: String, default: '' },
  proofs: [attachmentSchema],
  requestedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'NOT_REQUESTED',
  },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedByName: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
  approvedAmount: { type: Number, default: 0 },
  decisionRemarks: { type: String, default: '' },
}, { _id: false });

const expenseClaimSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    claimNumber: {
      type: String,
      index: true,
    },
    // Login user who filled the combined claim
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    submittedByName: { type: String, default: '' },
    claimType: { type: String, default: '', uppercase: true, trim: true },

    // Combined multi-employee claims: one claim doc, many employee sub-claims
    employeeClaims: [employeeClaimSchema],
    employeeCount: { type: Number, default: 1 },
    entries: { type: mongoose.Schema.Types.Mixed, default: undefined },

    // Trip reference info
    trip: {
      customerName: { type: String, default: '' },
      customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
      purpose: { type: String, default: '' },
      destination: { type: String, default: '' },
      destinationClass: { type: String, default: 'C' },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      travelMode: { type: String, default: '' },
      tourSanctioned: { type: Boolean, default: true },
    },

    // Policy snapshot
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpensePolicy', default: null },
    policyVersion: { type: String, default: '' },
    policyCode: { type: String, default: '' },
    policySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    approvalRequired: { type: Boolean, default: false },

    // Grand totals across ALL employees.
    // grandRequested = employee-requested amount (never overwritten),
    // grandAllowed = policy allowed, grandExcess = requested - allowed.
    grandRequested: { type: Number, default: 0 },
    grandAllowed: { type: Number, default: 0 },
    grandExcess: { type: Number, default: 0 },
    // What Accounts will pay: allowed, or the approved full-payment amount.
    payableAmount: { type: Number, default: 0 },

    // NORMAL  -> Food / Travel / Local Conveyance / Other, rules evaluated on claimDate.
    // LOGGING -> Lodging, rules evaluated on the fromDate -> toDate range.
    claimMode: { type: String, enum: ['NORMAL', 'LOGGING'], default: 'NORMAL', index: true },
    claimDate: { type: Date, default: null },
    fromDate: { type: Date, default: null },
    toDate: { type: Date, default: null },
    numberOfNights: { type: Number, default: 0 },

    receipts: [attachmentSchema],
    serviceReports: [attachmentSchema],
    fullPayment: { type: fullPaymentSchema, default: () => ({}) },

    // Server-computed submission window + outstation evidence snapshot
    claimEligibleUntil: { type: Date, default: null },
    deadlineOverriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    outstation: {
      verified: { type: Boolean, default: false },
      days: { type: Number, default: 0 },
      returnDate: { type: Date, default: null },
    },

    // Client-generated idempotency key (prevents one tap -> two claims)
    clientRequestId: { type: String, default: undefined },
    lockedAt: { type: Date, default: null },

    // Active workflow: DRAFT -> SUBMITTED ("Pending") -> PAID | REJECTED.
    // The other values are legacy (pre Paid/Rejected workflow) and are kept only so
    // historical documents still load; new code never writes them.
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'HR_PENDING',
        'HR_REJECTED',
        'FULL_PAYMENT_PENDING',
        'ACCOUNTS_PENDING',
        'ACCOUNTS_APPROVED',
        'ACCOUNTS_REJECTED',
        'REJECTED',
        'PAID',
        'RETURNED',
        'DISBURSED',
        'SETTLED',
        'CANCELLED',
      ],
      default: 'DRAFT',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'AWAITING_DISBURSEMENT', 'DISBURSED', 'PENDING', 'PAID', 'PARTIAL', 'REJECTED'],
      default: 'NOT_APPLICABLE',
      index: true,
    },
    approvalFlow: {
      type: String,
      enum: ['NONE', 'HR'],
      default: 'NONE',
    },
    approvalHistory: [approvalEntrySchema],
    timeline: [timelineEntrySchema],

    // Deadline rule results
    deadlineWarnings: [{ type: String, default: '' }],

    // Payment record (field names kept from the old disbursement flow):
    // disbursedAt = payment date, disbursedBy = user who recorded the payment.
    disbursedAt: { type: Date, default: null },
    disbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentMethod: { type: String, default: 'Bank Transfer' },
    utr: { type: String, default: '' },
    accountsRemarks: { type: String, default: '' },
    paidAmount: { type: Number, default: 0 },
    disbursement: {
      amount: { type: Number, default: 0 },
      paymentDate: { type: Date, default: null },
      paymentMethod: { type: String, default: 'Bank Transfer' },
      paymentReference: { type: String, default: '' },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      recordedByName: { type: String, default: '' },
      remarks: { type: String, default: '' },
    },

    // Rejection decision
    rejection: {
      reason: { type: String, default: '' },
      rejectedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedByName: { type: String, default: '' },
    },

    // Set by scripts/migrate_expense_paid_rejected.js: original status before migration
    legacyStatus: { type: String, default: '' },
    migratedAt: { type: Date, default: null },

    // HR action (legacy)
    hrReviewedAt: { type: Date, default: null },
    hrReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hrRemarks: { type: String, default: '' },

    submittedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

expenseClaimSchema.index({ companyId: 1, status: 1 });
expenseClaimSchema.index({ companyId: 1, approvalStatus: 1, paymentStatus: 1 });
expenseClaimSchema.index({ submittedBy: 1, createdAt: -1 });
expenseClaimSchema.index({ companyId: 1, submittedAt: -1 });
expenseClaimSchema.index({ companyId: 1, disbursedAt: -1 });
expenseClaimSchema.index({ companyId: 1, 'employeeClaims.employee.employeeId': 1, claimType: 1, claimDate: 1 });
expenseClaimSchema.index(
  { companyId: 1, submittedBy: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
);

// Auto-generate claim number EXP-YYYY-NNNNNN (continues from the highest number this
// year so deleted drafts never cause a number to be reused).
expenseClaimSchema.pre('save', async function (next) {
  if (!this.claimNumber) {
    const year = new Date().getFullYear();
    const prefix = `EXP-${year}-`;
    const last = await mongoose.models.ExpenseClaim.findOne({
      companyId: this.companyId,
      claimNumber: { $regex: `^${prefix}\\d+$` },
    }).sort({ claimNumber: -1 }).select('claimNumber').lean();
    const lastSeq = last ? parseInt(last.claimNumber.slice(prefix.length), 10) || 0 : 0;
    this.claimNumber = `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.models.ExpenseClaim || mongoose.model('ExpenseClaim', expenseClaimSchema);
