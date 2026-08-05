const mongoose = require('mongoose');

const ConditionSchema = new mongoose.Schema({
  field: {
    type: String,
    enum: ['amount', 'value', 'days', 'priority', 'materialType', 'documentType', 'department'],
    required: true,
  },
  operator: {
    type: String,
    enum: ['lt', 'lte', 'gt', 'gte', 'between', 'eq'],
    required: true,
  },
  value: mongoose.Schema.Types.Mixed,
  minValue: Number,
  maxValue: Number,
});

const WorkflowStepSchema = new mongoose.Schema({
  stepIndex: {
    type: Number,
    required: true,
  },
  stepName: {
    type: String,
    required: true,
  },
  approverType: {
    type: String,
    enum: ['REPORTS_TO', 'LEVEL', 'RESPONSIBILITY', 'DEPARTMENT_HEAD', 'SPECIFIC_USER'],
    required: true,
  },
  targetLevelNumber: Number,
  targetCategory: {
    type: String,
    enum: ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'],
  },
  targetRole: String,
  targetResponsibility: String,
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  targetDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },
  slaHours: {
    type: Number,
    default: 24,
  },
  canAutoApprove: {
    type: Boolean,
    default: false,
  },
});

const ApprovalWorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a workflow policy name'],
    trim: true,
  },
  module: {
    type: String,
    enum: ['Material', 'Expense', 'Leave', 'Purchase', 'CRM', 'Attendance', 'General'],
    required: true,
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },
  branch: {
    type: String,
    default: '',
  },
  documentType: {
    type: String,
    default: '',
  },
  materialType: {
    type: String,
    default: '',
  },
  conditions: [ConditionSchema],
  steps: [WorkflowStepSchema],
  priorityOrder: {
    type: Number,
    default: 10,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ApprovalWorkflow', ApprovalWorkflowSchema);
