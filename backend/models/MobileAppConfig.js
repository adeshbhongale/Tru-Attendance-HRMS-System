const mongoose = require('mongoose');

// Access control rule schema — reusable for login, tracking, and per-screen rules
const accessControlSchema = {
  blockedRoles: {
    type: [String],
    default: [],
  },
  blockedRoleCodes: {
    type: [String],
    default: [],
  },
  blockedCategories: {
    type: [String],
    enum: ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'],
    default: [],
  },
  blockedLevels: {
    type: [Number],
    default: [],
  },
  blockedEmployees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
};

const screenRuleSchema = new mongoose.Schema({
  screenKey: {
    type: String,
    required: true,
    trim: true,
  },
  screenName: {
    type: String,
    required: true,
    trim: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  // If non-empty, ONLY users belonging to these departments can see this screen. If empty, visible to all departments.
  departments: {
    type: [String],
    default: [],
  },
  // If true, ONLY users who have subordinates (reporting managers) can see this screen (e.g. Leave Approvals).
  requiresReportsTo: {
    type: Boolean,
    default: false,
  },
  ...accessControlSchema,
}, { _id: false });

const MobileAppConfigSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    unique: true,
    index: true,
  },
  screenRules: {
    type: [screenRuleSchema],
    default: [],
  },
  loginControl: {
    type: new mongoose.Schema({
      ...accessControlSchema,
    }, { _id: false }),
    default: () => ({}),
  },
  trackingControl: {
    type: new mongoose.Schema({
      ...accessControlSchema,
    }, { _id: false }),
    default: () => ({}),
  },
}, {
  timestamps: true,
});

// Default screen definitions for initial config (excludes Track My Route)
MobileAppConfigSchema.statics.getDefaultScreens = function () {
  return [
    { screenKey: 'attendance', screenName: 'Attendance', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'shift', screenName: 'Shift Management', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'leave', screenName: 'Leaves', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'leaveApprovals', screenName: 'Leave Approvals', enabled: true, departments: [], requiresReportsTo: true },
    { screenKey: 'profile', screenName: 'Profile', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'monthlyView', screenName: 'Monthly View', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'customerVisit', screenName: 'Customer Visit', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'expenseClaim', screenName: 'Expense Claim', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'reports', screenName: 'Reports', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'orgChart', screenName: 'Org Chart', enabled: true, departments: [], requiresReportsTo: false },
    { screenKey: 'materialDashboard', screenName: 'Material Dashboard', enabled: true, departments: [], requiresReportsTo: false },
  ];
};

module.exports = mongoose.model('MobileAppConfig', MobileAppConfigSchema);
