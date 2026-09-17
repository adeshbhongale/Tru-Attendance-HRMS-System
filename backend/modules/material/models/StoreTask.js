const mongoose = require('mongoose');

const StoreTaskSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Task must belong to a company'],
    index: true,
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: false,
    index: true,
  },
  taskType: {
    type: String,
    enum: ['DISPATCH', 'RETURN'],
    required: true,
  },
  returnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Return',
    default: null,
  },
  returnIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Return',
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: [
      'PENDING_MANAGER',
      'MANAGER_PROCESSING',
      'ESCALATED',
      'EMPLOYEE_PROCESSING',
      'SUBMITTED_FOR_CHECK',
      'MANAGER_CHECKING',
      'APPROVED',
      'SENT_BACK',
      'COMPLETED'
    ],
    default: 'PENDING_MANAGER',
  },
  escalated: {
    type: Boolean,
    default: false,
  },
  checklistData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  tallyVoucherNumber: {
    type: String,
    default: null,
  },
  assignedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

module.exports = mongoose.model('StoreTask', StoreTaskSchema);
