const LeaveType = require('../models/LeaveType');
const LeavePolicy = require('../models/LeavePolicy');
const LeavePolicyRule = require('../models/LeavePolicyRule');

// @desc    Get all leave types
// @route   GET /api/leave-types
// @access  Private
exports.getLeaveTypes = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.companyId || null;
    const leaveTypes = await LeaveType.find(companyId ? { companyId } : {});
    res.status(200).json({ success: true, count: leaveTypes.length, data: leaveTypes });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create leave type
// @route   POST /api/leave-types
// @access  Private/Admin
exports.createLeaveType = async (req, res, next) => {
  try {
    let companyId = req.tenant?.companyId || req.companyId || req.body.companyId;
    if (!companyId) {
      const Company = require('../models/Company');
      const defaultComp = await Company.findOne({ status: { $nin: ['SUSPENDED', 'INACTIVE', 'inactive'] } });
      if (defaultComp) companyId = defaultComp._id;
    }

    const hasLimit = req.body.hasLimit !== false;
    const leaveType = await LeaveType.create({ ...req.body, hasLimit, companyId });

    // Auto-create associated LeavePolicy & default company rule if not exists
    let policy = await LeavePolicy.findOne({ companyId, leaveTypeRef: leaveType._id });
    if (!policy) {
      policy = await LeavePolicy.create({
        companyId,
        leaveTypeRef: leaveType._id,
        name: `${leaveType.name} Policy`,
        periodType: req.body.periodType || (leaveType.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
        carryForward: req.body.carryForward || false,
        maxCarryForward: req.body.maxCarryForward || 0,
        prorateNewJoiner: true,
      });

      await LeavePolicyRule.create({
        companyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        hasLimit,
        days: hasLimit ? (typeof leaveType.limit === 'number' ? leaveType.limit : 12) : 0,
      });
    }

    res.status(201).json({ success: true, data: leaveType, policy });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update leave type
// @route   PUT /api/leave-types/:id
// @access  Private/Admin
exports.updateLeaveType = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.companyId || null;
    const query = companyId ? { _id: req.params.id, companyId } : { _id: req.params.id };

    const leaveType = await LeaveType.findOneAndUpdate(
      query,
      req.body,
      { new: true, runValidators: true }
    );
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });

    const effectiveCompanyId = leaveType.companyId || companyId;
    const hasLimit = leaveType.hasLimit !== false;

    // Sync associated LeavePolicy & default rule
    let policy = await LeavePolicy.findOne({ companyId: effectiveCompanyId, leaveTypeRef: leaveType._id });
    if (policy) {
      if (req.body.limitType) {
        policy.periodType = req.body.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY';
      }
      if (req.body.periodType) {
        policy.periodType = req.body.periodType;
      }
      if (req.body.carryForward !== undefined) {
        policy.carryForward = req.body.carryForward;
      }
      if (req.body.maxCarryForward !== undefined) {
        policy.maxCarryForward = req.body.maxCarryForward;
      }
      if (req.body.name) {
        policy.name = `${leaveType.name} Policy`;
      }
      await policy.save();

      await LeavePolicyRule.findOneAndUpdate(
        { companyId: effectiveCompanyId, policyId: policy._id, scopeType: 'company', scopeCode: '_default' },
        {
          hasLimit,
          days: hasLimit ? (typeof req.body.limit === 'number' ? req.body.limit : leaveType.limit) : 0
        },
        { upsert: true }
      );
    } else {
      policy = await LeavePolicy.create({
        companyId: effectiveCompanyId,
        leaveTypeRef: leaveType._id,
        name: `${leaveType.name} Policy`,
        periodType: req.body.periodType || (leaveType.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
        carryForward: req.body.carryForward || false,
        maxCarryForward: req.body.maxCarryForward || 0,
        prorateNewJoiner: true,
      });
      await LeavePolicyRule.create({
        companyId: effectiveCompanyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        hasLimit,
        days: hasLimit ? (typeof leaveType.limit === 'number' ? leaveType.limit : 12) : 0,
      });
    }

    res.status(200).json({ success: true, data: leaveType, policy });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete leave type
// @route   DELETE /api/leave-types/:id
// @access  Private/Admin
exports.deleteLeaveType = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.companyId || null;
    const query = companyId ? { _id: req.params.id, companyId } : { _id: req.params.id };

    const leaveType = await LeaveType.findOneAndDelete(query);
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });

    const effectiveCompanyId = leaveType.companyId || companyId;

    // Delete associated policy & rules
    const policy = await LeavePolicy.findOne({ companyId: effectiveCompanyId, leaveTypeRef: req.params.id });
    if (policy) {
      await LeavePolicyRule.deleteMany({ policyId: policy._id });
      await LeavePolicy.deleteOne({ _id: policy._id });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
