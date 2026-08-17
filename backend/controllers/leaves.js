const Leave = require('../models/Leave');
const User = require('../models/User');
const LeaveType = require('../models/LeaveType');
const leaveBalanceService = require('../services/leaveBalanceService');
const periodService = require('../services/leave/periodService');
const policyService = require('../services/leave/policyService');
const approvalService = require('../services/leave/approvalService');
const { getStartOfDayIST } = require('../utils/timezone');

const EXCLUDED_ADMIN_ROLES = [
  'superadmin', 'super_admin', 'company_admin', 'companyadmin', 'admin',
  'hr', 'hr_admin', 'store', 'store_admin', 'store_manager',
  'accounts', 'account_admin', 'finance', 'management', 'department_admin'
];

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { leaveType, startDate, endDate, reason, duration, startTime, endTime } = req.body;

    const companyId = req.tenant?.companyId || null;

    // Resolve leave type by code, _id, or name (with legacy name fallback)
    const lt = await leaveBalanceService.resolveLeaveType(companyId, leaveType);
    if (!lt) {
      return res.status(404).json({ success: false, message: 'Leave type not found or inactive' });
    }

    // Duration rules enforcement (Half Day, Full Day, Multiple Days)
    const allowed = lt.allowedDurations || ['Full Day', 'Half Day', 'Multiple Days'];
    const allowHalf = lt.allowHalfDay !== false && allowed.includes('Half Day');
    const allowFull = lt.allowFullDay !== false && allowed.includes('Full Day');
    const allowMulti = lt.allowMultipleDays !== false && allowed.includes('Multiple Days');

    const startStr = new Date(startDate).toISOString().slice(0, 10);
    const endStr = new Date(endDate || startDate).toISOString().slice(0, 10);
    const isMultiDay = duration === 'Full Day' && startStr !== endStr;

    if (duration === 'Half Day' && !allowHalf) {
      return res.status(400).json({
        success: false,
        message: `${lt.name} does not allow Half Day leave applications.`,
      });
    }

    if (isMultiDay && !allowMulti) {
      return res.status(400).json({
        success: false,
        message: `${lt.name} does not allow multiple days leave applications.`,
      });
    }

    if (duration === 'Full Day' && !isMultiDay && !allowFull) {
      return res.status(400).json({
        success: false,
        message: `${lt.name} does not allow single Full Day leave applications.`,
      });
    }

    const requestedDays = duration === 'Half Day' ? 0.5 : leaveBalanceService.calculateLeaveDays(
      { startDate, endDate, duration },
      await leaveBalanceService.getCompanyLeaveContext(companyId)
    );

    // Policy-aware over-limit guard: approved + pending + this request must
    // fit within the effective entitlement (policy rule or legacy limit).
    const check = await leaveBalanceService.canApplyForLeave(userId, companyId, lt, requestedDays);
    if (!check.allowed) {
      const limitLabel = lt.limitType === 'Monthly' ? 'monthly' : 'yearly';
      return res.status(400).json({
        success: false,
        message: `${lt.name} limit reached (Max ${check.limit} per ${limitLabel}). Available: ${Math.max(0, check.remaining).toFixed(1)} day(s).`,
      });
    }

    // Determine the allocation period + policy snapshot at application time.
    const policy = await policyService.policyForType(companyId, lt._id);
    const period = policy
      ? periodService.getPeriodWindow(policy.periodType, new Date())
      : periodService.getPeriodWindow(lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY', new Date());
    const policySnapshot = await policyService.buildPolicySnapshot(req.user, companyId, lt._id, new Date());

    // Freeze the reporting manager as approver at creation time.
    const approverId = req.user.reportsTo || req.user.approver || null;

    const leave = await Leave.create({
      user: userId,
      companyId,
      leaveType: lt.name,
      leaveTypeRef: lt._id,
      startDate,
      endDate: duration === 'Half Day' ? startDate : endDate,
      reason,
      duration,
      startTime: duration === 'Half Day' ? startTime : undefined,
      endTime: duration === 'Half Day' ? endTime : undefined,
      status: 'Pending', // Force pending on application
      periodKey: period.periodKey,
      policySnapshot,
      durationDays: requestedDays,
      approverId,
    });

    // Trigger notification to the reporting manager (approver).
    try {
      const notificationService = require('../services/notificationService');
      const io = req.app.get('io');
      await notificationService.createAndSendNotification({
        title: 'New Leave Request 📋',
        description: `Employee ${req.user.name} (${req.user.email}) has submitted a pending leave request for ${lt.name} (${duration}).`,
        type: 'general notification',
        frequency: 'Instant',
        targetType: approverId ? 'Specific Employees' : 'Role-based Employees',
        targetRole: approverId ? null : 'admin',
        employees: approverId ? [approverId] : [],
        isAuto: false
      }, io);
    } catch (e) {
      console.error('[Leave Request Alert] Failed to send admin notification:', e.message);
    }

    res.status(201).json({
      success: true,
      data: leave,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get user leave history
// @route   GET /api/leaves/my-leaves
// @access  Private
exports.getMyLeaves = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const leaves = await Leave.find({ user: userId }).sort('-createdAt').lean();
    const rawQuotas = await leaveBalanceService.getEmployeeQuotas(userId, companyId);
    const quotas = (rawQuotas || []).filter(q => !(q.ineligible || q.limit === 0));

    res.status(200).json({
      success: true,
      count: leaves.length,
      quotas,
      data: leaves,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get all leaves (Admin)
// @route   GET /api/leaves
// @access  Private/Admin
exports.getAllLeaves = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const companyId = req.tenant?.companyId || null;
    let filter = { ...(companyId ? { companyId : companyId } : {}) };
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.startDate = { $lte: end };
      filter.endDate = { $gte: start };
    }

    const allLeaves = await Leave.find(filter)
      .populate('user', 'name email department profileImage designation')
      .sort('-createdAt')
      .lean();

    const now = new Date();
    const leaves = allLeaves
      .filter(l => {
        if (!l.user) return false;
        const uRole = (l.user.role || '').toLowerCase();
        const uRoleCode = (l.user.roleCode || '').toUpperCase();
        if (EXCLUDED_ADMIN_ROLES.includes(uRole) || uRoleCode === 'TCSA1' || uRoleCode === 'TCCA1') return false;
        return true;
      })
      .map(l => {
        // Create a copy of the lean object
        const leaveData = { ...l };
        if (leaveData.status === 'Pending' && leaveData.startDate && new Date(leaveData.startDate) < now) {
          leaveData.status = 'Cancelled';
        }
        return leaveData;
      });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (err) {
    console.error('GetAllLeaves Error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get all leave balances (Admin) — per employee per leave type
// @route   GET /api/leaves/balances?userId=xxx
// @access  Private/Admin
exports.getEmployeeBalances = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const userId = req.query.userId || null;

    const base = {
      role: { $nin: EXCLUDED_ADMIN_ROLES },
      roleCode: { $nin: ['TCSA1', 'TCCA1'] },
      ...(companyId ? { companyId } : {})
    };
    const employees = userId
      ? await User.find({ ...base, _id: userId }).select('name designation department profileImage')
      : await User.find(base).select('name designation department profileImage');

    const employeeIds = employees.map(emp => emp._id);
    const quotasMap = await leaveBalanceService.getEmployeesQuotasMap(employeeIds, companyId);

    // Seed stored balances for editable view when missing
    await Promise.all(employeeIds.map(uid => leaveBalanceService.ensureEmployeeBalances(uid, companyId)));

    const balances = employees.map(emp => {
      const quotas = quotasMap.get(emp._id.toString()) || [];
      return {
        _id: emp._id,
        name: emp.name,
        designation: emp.designation || 'N/A',
        department: emp.department || 'N/A',
        profileImage: emp.profileImage,
        balances: quotas,
      };
    });

    res.status(200).json({ success: true, count: balances.length, data: balances });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Set an employee's leave allowance for a leave type (Admin)
// @route   PUT /api/leaves/balances/:userId/:leaveTypeId
// @access  Private/Admin
exports.setEmployeeBalance = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { userId, leaveTypeId } = req.params;
    const { limit } = req.body;

    if (!userId || !leaveTypeId) {
      return res.status(400).json({ success: false, message: 'userId and leaveTypeId are required' });
    }

    const doc = await leaveBalanceService.setEmployeeLeaveBalance(userId, companyId, leaveTypeId, Number(limit));

    res.status(200).json({
      success: true,
      data: {
        userId,
        leaveTypeRef: doc.leaveTypeRef,
        leaveType: doc.leaveType,
        code: doc.code,
        limit: doc.limit,
        limitType: doc.limitType,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Update leave status (Admin / reporting manager)
// @route   PATCH /api/leaves/:id
// @access  Private/Admin or Reporting manager
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });

    if (!leave) {
      return res.status(404).json({ success: false, message: `Leave record ${req.params.id} not found` });
    }

    const oldStatus = leave.status;
    const { status, adminNote } = req.body;

    // Only allow approve/reject/cancel transitions; enforce that the acting
    // user is the employee's reporting manager (or an admin/superadmin).
    const allowedTransitions = {
      Pending: ['Approved', 'Rejected', 'Cancelled'],
    };
    if (!status || oldStatus === 'Cancelled' || oldStatus === 'Rejected') {
      return res.status(400).json({ success: false, message: `Cannot change status from ${oldStatus}` });
    }
    if (oldStatus === 'Pending' && !allowedTransitions.Pending.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot change status to ${status}` });
    }

    if (['Approved', 'Rejected'].includes(status)) {
      await approvalService.assertApprover(leave, req.user);
    }
    if (status === 'Approved' && oldStatus !== 'Approved') {
      const posted = await approvalService.recordTransition(leave, 'Approved', companyId);
      if (posted) leave.ledgerPosted = true;
      const days = leave.duration === 'Half Day' ? 0.5 : (leave.durationDays || (Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1));
      const targetUser = await User.findById(leave.user);
      if (targetUser) {
        targetUser.leaveBalance = Math.max(0, (targetUser.leaveBalance || 0) - days);
        await targetUser.save();
      }
    }
    if (status === 'Cancel' || status === 'Cancelled') {
      await approvalService.recordTransition(leave, 'Cancelled', companyId);
    }

    if (status) leave.status = status;
    if (adminNote) leave.adminNote = adminNote;

    await leave.save();

    // Deprecated: legacy Approval check. Ledger is now the single source for
    // used balance; keep auto-cancel of overbooked pending leaves as a guard.
    if (req.body.status === 'Approved' && oldStatus !== 'Approved') {
      try {
        const lt = await leaveBalanceService.resolveLeaveType(companyId, leave.leaveType);
        if (lt) {
          const check = await leaveBalanceService.canApplyForLeave(leave.user, companyId, lt, 0);
          if (!check.allowed && check.used > check.limit) {
            const period = check.period;
            await Leave.updateMany({
              user: leave.user,
              ...(companyId ? { companyId } : {}),
              leaveType: lt.name,
              status: 'Pending',
              startDate: { $gte: period.start, $lte: period.end },
              _id: { $ne: leave._id }
            }, {
              status: 'Cancelled',
              adminNote: 'Auto-cancelled: leave type limit reached.'
            });
          }
        }
      } catch (e) {
        console.error('Leave auto-cancel recompute failed:', e.message);
      }
    }

    res.status(200).json({
      success: true,
      data: leave,
    });

    // Hook in automated notifications
    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      if (status === 'Approved') {
        autoNotif.triggerLeaveApproved(leave.user, leave.leaveType, io);
      }
    } catch (e) {
      console.error('Leave status update notification hook failed:', e);
    }
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    List leave requests where the current user is the reporting manager
// @route   GET /api/leaves/approvals
// @access  Private (reporting managers & admins)
exports.getMyApprovals = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const filters = {
      ...(companyId ? { companyId } : {}),
    };

    const userRole = (req.user.role || '').toLowerCase();
    const userRoleCode = (req.user.roleCode || '').toUpperCase();
    const isGlobalOrCompanyAdmin = userRole === 'superadmin' || userRole === 'company_admin' || userRoleCode === 'TCSA1' || userRoleCode === 'TCCA1';

    const User = require('../models/User');
    const myDirectReports = await User.find({ reportsTo: req.user.id }).select('_id').lean();
    const directReportIds = myDirectReports.map((u) => u._id);
    const hasSubordinates = isGlobalOrCompanyAdmin || directReportIds.length > 0;

    if (!isGlobalOrCompanyAdmin) {
      if (directReportIds.length === 0) {
        // Check if there are explicit approvals assigned to this user as approverId
        const explicitCount = await Leave.countDocuments({ approverId: req.user.id });
        if (explicitCount === 0) {
          return res.status(200).json({
            success: true,
            count: 0,
            hasSubordinates: false,
            data: [],
          });
        }
      }

      filters.$or = [
        { approverId: req.user.id },
        { user: { $in: directReportIds } },
      ];
    }

    const approvals = await Leave.find(filters)
      .populate('user', 'name email department designation profileImage reportsTo')
      .sort('-createdAt')
      .lean();

    res.status(200).json({
      success: true,
      count: approvals.length,
      hasSubordinates,
      data: approvals,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Approve a leave request (reporting manager)
// @route   PATCH /api/leaves/approvals/:id/approve
// @access  Private (reporting manager)
exports.approveLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ success: false, message: 'Leave is not pending' });

    await approvalService.assertApprover(leave, req.user);
    const posted = await approvalService.recordTransition(leave, 'Approved', companyId);
    if (posted) leave.ledgerPosted = true;

    leave.status = 'Approved';
    if (req.body.adminNote) leave.adminNote = req.body.adminNote;
    await leave.save();

    // Deduct employee leave balance
    const days = leave.duration === 'Half Day' ? 0.5 : (leave.durationDays || (Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1));
    const targetUser = await User.findById(leave.user);
    if (targetUser) {
      targetUser.leaveBalance = Math.max(0, (targetUser.leaveBalance || 0) - days);
      await targetUser.save();
    }

    res.status(200).json({ success: true, data: leave });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Reject a leave request (reporting manager)
// @route   PATCH /api/leaves/approvals/:id/reject
// @access  Private (reporting manager)
exports.rejectLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ success: false, message: 'Leave is not pending' });

    await approvalService.assertApprover(leave, req.user);

    leave.status = 'Rejected';
    if (req.body.adminNote) leave.adminNote = req.body.adminNote;
    await leave.save();

    res.status(200).json({ success: true, data: leave });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Cancel my leave request (Employee)
// @route   PATCH /api/leaves/cancel/:id
// @access  Private
exports.cancelLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (leave.status === 'Approved' && leave.startDate && new Date(leave.startDate) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Approved leave that has already started cannot be cancelled.' });
    }
    if (['Rejected', 'Cancelled'].includes(leave.status)) {
      return res.status(400).json({ success: false, message: `Leave is already ${leave.status.toLowerCase()}` });
    }

    // If an approved leave is being cancelled, credit the consumption back.
    if (leave.status === 'Approved') {
      await approvalService.recordTransition(leave, 'Cancelled', companyId);
      const days = leave.duration === 'Half Day' ? 0.5 : (leave.durationDays || (Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1));
      const targetUser = await User.findById(leave.user);
      if (targetUser) {
        targetUser.leaveBalance = (targetUser.leaveBalance || 0) + days;
        await targetUser.save();
      }
    }

    leave.status = 'Cancelled';
    await leave.save();
    res.status(200).json({ success: true, data: leave });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Update my leave request (Employee)
// @route   PUT /api/leaves/update/:id
// @access  Private
exports.updateLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (leave.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Can only update pending requests' });
    }

    const { leaveType, startDate, endDate, reason, duration, startTime, endTime } = req.body;
    const updateData = {};
    if (leaveType) updateData.leaveType = leaveType;
    if (startDate) updateData.startDate = startDate;
    if (endDate) updateData.endDate = duration === 'Half Day' ? (startDate || leave.startDate) : endDate;
    if (reason) updateData.reason = reason;
    if (duration) updateData.duration = duration;
    
    if (duration === 'Half Day') {
      updateData.startTime = startTime;
      updateData.endTime = endTime;
    } else if (duration === 'Full Day') {
      updateData.startTime = null;
      updateData.endTime = null;
    }

    const updated = await Leave.findOneAndUpdate({ _id: req.params.id, ...(companyId ? { companyId } : {}) }, updateData, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get leave dashboard data (Admin)
// @route   GET /api/leaves/dashboard
// @access  Private/Admin
exports.getLeaveDashboard = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const companyId = req.tenant?.companyId || null;

    let filter = { ...(companyId ? { companyId : companyId } : {}) };
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.startDate = { $lte: end };
      filter.endDate = { $gte: start };
    }

    const employees = await User.find({
      ...(companyId ? { companyId } : {}),
      role: { $nin: EXCLUDED_ADMIN_ROLES },
      roleCode: { $nin: ['TCSA1', 'TCCA1'] }
    }).select('name designation department profileImage leaveBalance monthlyLeaveLimit role employeeIdCode');
    const employeeIds = employees.map(emp => emp._id);
    const employeeIdSet = new Set(employeeIds.map(id => id.toString()));
    const allLeaves = (await Leave.find(filter).lean()).filter(l => l.user && employeeIdSet.has(l.user.toString()));
    
    let activeLeaveTypes = await LeaveType.find({ status: 'active', ...(companyId ? { companyId } : {}) }).lean();
    if (!activeLeaveTypes || activeLeaveTypes.length === 0) {
      activeLeaveTypes = await LeaveType.find({ status: 'active' }).lean();
    }
    if (!activeLeaveTypes || activeLeaveTypes.length === 0) {
      activeLeaveTypes = await LeaveType.find({}).lean();
    }
    if (!activeLeaveTypes || activeLeaveTypes.length === 0) {
      activeLeaveTypes = [
        { _id: 'casual', name: 'Casual Leave', code: 'CL', limit: 12, limitType: 'Yearly' },
        { _id: 'sick', name: 'Sick Leave', code: 'SL', limit: 10, limitType: 'Yearly' },
        { _id: 'paid', name: 'Paid Leave', code: 'PL', limit: 15, limitType: 'Yearly' },
      ];
    }

    // Per-employee per-type quotas computed over the correct reference period
    const refDate = startDate ? new Date(startDate) : new Date();
    const quotasMap = await leaveBalanceService.getEmployeesQuotasMap(employeeIds, companyId, refDate);

    const dashboardData = employees.map(emp => {
      const empLeaves = allLeaves.filter(l => l.user.toString() === emp._id.toString());
      const empQuotas = quotasMap.get(emp._id.toString()) || [];

      const fullDaysCount = empLeaves
        .filter(l => l.status === 'Approved' && l.duration === 'Full Day')
        .reduce((acc, l) => acc + leaveBalanceService.calculateLeaveDays(l, {}), 0);

      const halfDaysCount = empLeaves
        .filter(l => l.status === 'Approved' && l.duration === 'Half Day')
        .reduce((acc, l) => acc + 0.5, 0);

      const stats = {
        pending: empLeaves.filter(l => l.status === 'Pending').length,
        approved: empLeaves.filter(l => l.status === 'Approved').length,
        rejected: empLeaves.filter(l => l.status === 'Rejected').length,
        cancelled: empLeaves.filter(l => l.status === 'Cancelled').length,
        halfDays: Math.round(halfDaysCount * 2) / 2,
        fullDays: Math.round(fullDaysCount * 2) / 2,
        leaveTypes: {}
      };

      activeLeaveTypes.forEach(lt => {
        const typeLeaves = empLeaves.filter(l => {
          if (l.status !== 'Approved') return false;
          const nameA = (l.leaveType || '').toLowerCase().trim();
          const nameB = (lt.name || '').toLowerCase().trim();
          const codeB = (lt.code || '').toLowerCase().trim();
          return nameA === nameB || nameA === codeB || (nameA && nameB && (nameA.includes(nameB) || nameB.includes(nameA))) || (l.leaveTypeRef && lt._id && l.leaveTypeRef.toString() === lt._id.toString());
        });
        const quota = empQuotas.find(q => (q.code && q.code === lt.code) || (q.name && q.name === lt.name)) || null;
        const availed = quota ? quota.used : typeLeaves.reduce((acc, l) => acc + leaveBalanceService.calculateLeaveDays(l, {}), 0);
        const limit = quota ? quota.limit : (typeof lt.limit === 'number' ? lt.limit : (emp.leaveBalance || 12));
        const balance = Math.max(0, limit - availed);
        const ltKey = lt.code || lt.name;

        if (quota && (quota.limit === 0 || quota.ineligible)) {
          // Employee is not eligible for this targeted leave type (e.g. Trainee/Intern)
          return;
        }

        stats.leaveTypes[ltKey] = {
          total: limit,
          limitType: lt.limitType || 'Yearly',
          availed: Math.round(availed * 2) / 2,
          balance: Math.round(balance * 2) / 2,
          pending: quota ? quota.pending : 0,
          fullCount: typeLeaves.filter(l => l.duration === 'Full Day').length,
          halfCount: typeLeaves.filter(l => l.duration === 'Half Day').length
        };
      });

      return {
        _id: emp._id,
        name: emp.name,
        designation: emp.designation || 'Staff Member',
        department: emp.department || 'N/A',
        role: emp.role || 'employee',
        profileImage: emp.profileImage,
        stats
      };
    });

    const totalFull = allLeaves
      .filter(l => l.status === 'Approved' && l.duration === 'Full Day')
      .reduce((acc, l) => acc + leaveBalanceService.calculateLeaveDays(l, {}), 0);

    const totalHalf = allLeaves
      .filter(l => l.status === 'Approved' && l.duration === 'Half Day')
      .reduce((acc, l) => acc + 0.5, 0);

    res.status(200).json({
      success: true,
      data: dashboardData,
      leaveTypes: activeLeaveTypes,
      summary: {
        pending: allLeaves.filter(l => l.status === 'Pending').length,
        approved: allLeaves.filter(l => l.status === 'Approved').length,
        rejected: allLeaves.filter(l => l.status === 'Rejected').length,
        cancelled: allLeaves.filter(l => l.status === 'Cancelled').length,
        totalFullDays: Math.round(totalFull * 2) / 2,
        totalHalfDays: Math.round(totalHalf * 2) / 2
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};