const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  metadata: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String,
    date: String,
    time: String,
    device: String,
    employeeName: String,
    capturedAt: Date,
  },
});

const barcodeEntrySchema = new mongoose.Schema({
  barcode: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Returned', 'Closed', 'pending_acceptance', 'Exchanged', 'Cancelled'], default: 'Active' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const materialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'pcs', trim: true },
  price: { type: Number, default: 0 },
  barcodes: [barcodeEntrySchema],
  photos: [photoSchema],
});

const approvalEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: String,
  action: { type: String, enum: ['approved', 'rejected'] },
  timestamp: { type: Date, default: Date.now },
  remarks: { type: String, default: '' },
});

const timelineEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  description: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed },
});

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      index: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'Department',
      required: true,
    },
    teamLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    managementApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    handler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    otherReceiverName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'tl_approved',
        'mgt_approved',
        'store_accepted',
        'handler_assigned',
        'dispatched',
        'received',
        'active',
        'partially_returned',
        'closed',
        'cancelled',
        'rejected',
      ],
      default: 'submitted',
      index: true,
    },
    documentType: {
      type: String,
      enum: ['DC', 'RDC', 'Invoice', 'Emergency Send'],
      default: 'RDC',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    dueDate: { type: Date },
    expectedReturnDate: { type: Date },
    escalated: { type: Boolean, default: false },
    crossDepartment: { type: Boolean, default: false },
    targetDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    costCenter: { type: String, default: '' },
    description: { type: String, default: '' },
    remarks: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    requesterRejected: { type: Boolean, default: false },
    rejectedDeliveryStatus: { type: String, enum: ['', 'rejected_by_requester', 'sent_to_store', 'store_accepted'], default: '' },

    // Pending handler transfer (two-step accept/reject)
    pendingHandlerTransfer: {
      toHandler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fromHandler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: null },
      remarks: { type: String, default: '' },
      rejectReason: { type: String, default: '' },
      resolvedAt: { type: Date },
    },

    // Materials with per-unit barcodes
    materials: [materialSchema],

    // Approval chain
    approvalChain: [approvalEntrySchema],

    // Timeline
    timeline: [timelineEntrySchema],

    // Photos and documents
    photos: [photoSchema],
    documents: [
      {
        name: String,
        url: String,
        type: { type: String },
        size: Number,
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Chat members (dynamic)
    chatMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    chatLocked: { type: Boolean, default: false },

    // Progress tracking
    totalItems: { type: Number, default: 0 },
    activeItems: { type: Number, default: 0 },
    returnedItems: { type: Number, default: 0 },
    closedItems: { type: Number, default: 0 },

    // Closure
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    grandTotal: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Auto generate transaction ID: RDC-YYYY-NNNNNN
transactionSchema.pre('save', async function (next) {
  if (this.materials && this.materials.length > 0) {
    this.grandTotal = this.materials.reduce((sum, m) => sum + ((m.price || 0) * (m.quantity || 0)), 0);
  }
  if (!this.transactionId) {
    const docPrefix = this.documentType || 'RDC';
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    this.transactionId = `${docPrefix}-${year}-${randomSuffix}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
