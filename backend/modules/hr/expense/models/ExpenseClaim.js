const mongoose = require('mongoose');
const expenseItemSchema = require('./ExpenseItem');

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
  action: { type: String, enum: ['approved', 'rejected', 'returned', 'disbursed'], default: 'approved' },
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

    // Trip reference info
    trip: {
      customerName: { type: String, default: '' },
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

    // Grand totals across ALL employees
    grandRequested: { type: Number, default: 0 },
    grandAllowed: { type: Number, default: 0 },
    grandExcess: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'HR_PENDING',
        'HR_REJECTED',
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
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIAL', 'REJECTED', 'NOT_APPLICABLE'],
      default: 'PENDING',
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

    // Disbursement
    disbursedAt: { type: Date, default: null },
    disbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentMethod: { type: String, default: '' },
    utr: { type: String, default: '' },
    accountsRemarks: { type: String, default: '' },
    paidAmount: { type: Number, default: 0 },

    // HR action
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
expenseClaimSchema.index({ submittedBy: 1, createdAt: -1 });

// Auto-generate claim number EXP-YYYY-NNNNNN
expenseClaimSchema.pre('save', async function (next) {
  if (!this.claimNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.models.ExpenseClaim.countDocuments({ companyId: this.companyId });
    this.claimNumber = `EXP-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.models.ExpenseClaim || mongoose.model('ExpenseClaim', expenseClaimSchema);
