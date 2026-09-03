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
  stepType: {
    type: String,
    enum: ['APPROVAL', 'DISPATCH', 'RECEIVE', 'TRANSFER', 'RETURN', 'STORE', 'NOTIFICATION', 'AUTO', 'CONDITION', 'SPLIT', 'EXCHANGE', 'MERGE', 'DC_INTERNAL', 'DC_FOC', 'INVOICE', 'CLOSE', 'END'],
    default: 'APPROVAL',
  },
  approverType: {
    type: String,
    enum: ['REPORTS_TO', 'LEVEL', 'RESPONSIBILITY', 'DEPARTMENT_HEAD', 'SPECIFIC_USER', 'IMMEDIATE_MANAGER', 'ROLE', 'EMPLOYEE', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'HR_ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'REQUESTER', 'ANY_EMPLOYEE', 'MANAGEMENT_CATEGORY'],
    default: 'REPORTS_TO',
  },
  approverRule: {
    type: String,
    enum: ['IMMEDIATE_MANAGER', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'HR_ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'ROLE', 'RESPONSIBILITY', 'EMPLOYEE', 'SPECIFIC_USER', 'DEPARTMENT_HEAD', 'LEVEL', 'MANAGEMENT_CATEGORY', 'REQUESTER', 'ANY_EMPLOYEE'],
    default: 'IMMEDIATE_MANAGER',
  },
  dispatchMethod: {
    type: String,
    enum: ['HANDLER', 'DIRECT', 'COURIER', 'VENDOR'],
    default: 'HANDLER',
  },
  storeType: {
    type: String,
    enum: ['MAIN_WAREHOUSE', 'BRANCH_WAREHOUSE', 'DEPARTMENT_STORE'],
    default: 'MAIN_WAREHOUSE',
  },
  featureFlags: {
    assignHandler: { type: Boolean, default: true },
    directDispatch: { type: Boolean, default: true },
    returnRequired: { type: Boolean, default: true },
    barcodeSplit: { type: Boolean, default: true },
    warrantyExchange: { type: Boolean, default: true },
    closeRequest: { type: Boolean, default: true },
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
