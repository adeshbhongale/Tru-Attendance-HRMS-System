const LeaveType = require('../models/LeaveType');
const LeavePolicy = require('../models/LeavePolicy');
const LeavePolicyRule = require('../models/LeavePolicyRule');

// Normalize and reorder sequenceOrder (1..N) across a company's leave types & policies.
// When `targetId` is given a `requestedOrder` (e.g. 1), it is placed at that 1-based
// position and all other leave types shift cleanly so sequence numbers are unique (1, 2, 3...).
const syncCompanyLeaveSequence = async (companyId, targetId = null, requestedOrder = null) => {
  let effectiveCompanyId = companyId;
  if (!effectiveCompanyId && targetId) {
    const tDoc = await LeaveType.findById(targetId).lean();
    if (tDoc?.companyId) effectiveCompanyId = tDoc.companyId;
  }
  const filter = effectiveCompanyId ? { companyId: effectiveCompanyId } : {};
  const allTypes = await LeaveType.find(filter).sort({ createdAt: 1 }).lean();
  if (!allTypes || allTypes.length === 0) return;

  allTypes.sort((a, b) => {
    const sa = typeof a.sequenceOrder === 'number' ? a.sequenceOrder : 999999;
    const sb = typeof b.sequenceOrder === 'number' ? b.sequenceOrder : 999999;
    if (sa !== sb) return sa - sb;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  let ordered = [...allTypes];
  if (targetId && requestedOrder !== null && requestedOrder !== undefined && !Number.isNaN(Number(requestedOrder))) {
    const idx = ordered.findIndex(t => t._id.toString() === targetId.toString());
    if (idx !== -1) {
      const [targetDoc] = ordered.splice(idx, 1);
      const insertAt = Math.max(0, Math.min(ordered.length, Math.round(Number(requestedOrder)) - 1));
      ordered.splice(insertAt, 0, targetDoc);
    }
  }

  for (let i = 0; i < ordered.length; i++) {
    const seq = i + 1;
    const doc = ordered[i];
    if (doc.sequenceOrder !== seq) {
      await LeaveType.updateOne({ _id: doc._id }, { $set: { sequenceOrder: seq } });
      doc.sequenceOrder = seq;
    }
    await LeavePolicy.updateMany({ leaveTypeRef: doc._id }, { $set: { sequenceOrder: seq } });
  }
};

exports.syncCompanyLeaveSequence = syncCompanyLeaveSequence;

// @desc    Get all leave types
// @route   GET /api/leave-types
// @access  Private
exports.getLeaveTypes = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.companyId || null;
    await syncCompanyLeaveSequence(companyId);
    const leaveTypes = await LeaveType.find(companyId ? { companyId } : {}).sort({ sequenceOrder: 1, createdAt: 1 });
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
    const allowedDays = Array.isArray(req.body.allowedDays) ? req.body.allowedDays : [];
    const existingCount = await LeaveType.countDocuments(companyId ? { companyId } : {});
    const initialSeq = req.body.sequenceOrder !== undefined && req.body.sequenceOrder !== ''
      ? Math.max(1, Number(req.body.sequenceOrder))
      : existingCount + 1;
    const leaveType = await LeaveType.create({ ...req.body, hasLimit, allowedDays, sequenceOrder: initialSeq, companyId });

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
        allowedDays,
        sequenceOrder: initialSeq,
      });

      await LeavePolicyRule.create({
        companyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        hasLimit,
        days: hasLimit ? (typeof leaveType.limit === 'number' ? leaveType.limit : 12) : 0,
        allowedDays,
      });
    }

    await syncCompanyLeaveSequence(companyId, leaveType._id, initialSeq);
    const updatedLeaveType = await LeaveType.findById(leaveType._id);
    const updatedPolicy = await LeavePolicy.findById(policy._id);

    res.status(201).json({ success: true, data: updatedLeaveType || leaveType, policy: updatedPolicy || policy });
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
      if (req.body.allowedDays !== undefined) {
        policy.allowedDays = Array.isArray(req.body.allowedDays) ? req.body.allowedDays : [];
      }
      if (req.body.name) {
        policy.name = `${leaveType.name} Policy`;
      }
      await policy.save();

      await LeavePolicyRule.findOneAndUpdate(
        { companyId: effectiveCompanyId, policyId: policy._id, scopeType: 'company', scopeCode: '_default' },
        {
          hasLimit,
          days: hasLimit ? (typeof req.body.limit === 'number' ? req.body.limit : leaveType.limit) : 0,
          ...(req.body.allowedDays !== undefined ? { allowedDays: policy.allowedDays } : {})
        },
        { upsert: true }
      );
    } else {
      const effectiveAllowedDays = Array.isArray(leaveType.allowedDays) ? leaveType.allowedDays : [];
      policy = await LeavePolicy.create({
        companyId: effectiveCompanyId,
        leaveTypeRef: leaveType._id,
        name: `${leaveType.name} Policy`,
        periodType: req.body.periodType || (leaveType.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
        carryForward: req.body.carryForward || false,
        maxCarryForward: req.body.maxCarryForward || 0,
        prorateNewJoiner: true,
        allowedDays: effectiveAllowedDays,
      });
      await LeavePolicyRule.create({
        companyId: effectiveCompanyId,
        policyId: policy._id,
        scopeType: 'company',
        scopeCode: '_default',
        hasLimit,
        days: hasLimit ? (typeof leaveType.limit === 'number' ? leaveType.limit : 12) : 0,
        allowedDays: effectiveAllowedDays,
      });
    }

    if (req.body.sequenceOrder !== undefined && req.body.sequenceOrder !== '') {
      await syncCompanyLeaveSequence(effectiveCompanyId, leaveType._id, Number(req.body.sequenceOrder));
    } else {
      await syncCompanyLeaveSequence(effectiveCompanyId);
    }

    const finalLeaveType = await LeaveType.findById(leaveType._id);
    const finalPolicy = await LeavePolicy.findById(policy._id);

    res.status(200).json({ success: true, data: finalLeaveType || leaveType, policy: finalPolicy || policy });
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
