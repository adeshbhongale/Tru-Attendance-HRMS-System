const LeaveType = require('../models/LeaveType');
const LeavePolicy = require('../models/LeavePolicy');
const LeavePolicyRule = require('../models/LeavePolicyRule');

// @desc    Get all leave types
// @route   GET /api/leave-types
// @access  Private
exports.getLeaveTypes = async (req, res, next) => {
  try {
    const leaveTypes = await LeaveType.find({ companyId: req.tenant.companyId });
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
    const companyId = req.tenant.companyId;
    const leaveType = await LeaveType.create({ ...req.body, companyId });

    // Auto-create associated LeavePolicy & default company rule if not exists
    let policy = await LeavePolicy.findOne({ companyId, leaveTypeRef: leaveType._id });
    if (!policy) {
      policy = await LeavePolicy.create({
        companyId,
        leaveTypeRef: leaveType._id,
        name: `${leaveType.name} Policy`,
        periodType: leaveType.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
        prorateNewJoiner: true,
      });

      await LeavePolicyRule.create({
        companyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        days: typeof leaveType.limit === 'number' ? leaveType.limit : 12,
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
    const companyId = req.tenant.companyId;
    const leaveType = await LeaveType.findOneAndUpdate(
      { _id: req.params.id, companyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });

    // Sync associated LeavePolicy & default rule
    let policy = await LeavePolicy.findOne({ companyId, leaveTypeRef: leaveType._id });
    if (policy) {
      if (req.body.limitType) {
        policy.periodType = req.body.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY';
      }
      if (req.body.name) {
        policy.name = `${leaveType.name} Policy`;
      }
      await policy.save();

      if (typeof req.body.limit === 'number') {
        await LeavePolicyRule.findOneAndUpdate(
          { companyId, policyId: policy._id, scopeType: 'company', scopeCode: '_default' },
          { days: req.body.limit },
          { upsert: true }
        );
      }
    } else {
      policy = await LeavePolicy.create({
        companyId,
        leaveTypeRef: leaveType._id,
        name: `${leaveType.name} Policy`,
        periodType: leaveType.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
        prorateNewJoiner: true,
      });
      await LeavePolicyRule.create({
        companyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        days: typeof leaveType.limit === 'number' ? leaveType.limit : 12,
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
    const companyId = req.tenant.companyId;
    const leaveType = await LeaveType.findOneAndDelete({ _id: req.params.id, companyId });
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });

    // Delete associated policy & rules
    const policy = await LeavePolicy.findOne({ companyId, leaveTypeRef: req.params.id });
    if (policy) {
      await LeavePolicyRule.deleteMany({ policyId: policy._id });
      await LeavePolicy.deleteOne({ _id: policy._id });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
