const Leave = require('../models/Leave');
const User = require('../models/User');
const LeaveType = require('../models/LeaveType');
const leaveBalanceService = require('../services/leaveBalanceService');
const periodService = require('../services/leave/periodService');
const policyService = require('../services/leave/policyService');
const approvalService = require('../services/leave/approvalService');
const { getStartOfDayIST } = require('../utils/timezone');
const { isCompanyAdminUser } = require('../utils/accessControlHelper');

const EXCLUDED_ADMIN_ROLES = [
  'superadmin', 'super_admin', 'company_admin', 'companyadmin', 'admin',
  'hr', 'hr_admin', 'store', 'store_admin', 'store_manager',
  'accounts', 'account_admin', 'finance', 'management', 'department_admin'
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseDateUTC = (val) => {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    const [y, m, d] = val.trim().slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const { getISTDateComponents } = require('../utils/timezone');
  const ist = getISTDateComponents(new Date(val));
  return new Date(Date.UTC(ist.year, ist.month, ist.date));
};

const getEffectiveAllowedDays = async (user, companyId, lt) => {
  if (!lt) return [];
  const policy = lt._id ? await policyService.policyForType(companyId, lt._id) : null;
  if (policy) {
    const rules = await policyService.rulesForPolicies([policy._id]);
    const matchedRule = user ? policyService.resolveRule(user, rules) : null;
    if (matchedRule && Array.isArray(matchedRule.allowedDays) && matchedRule.allowedDays.length > 0) {
      return matchedRule.allowedDays.filter(d => d && d !== 'All');
    }
    if (Array.isArray(policy.allowedDays) && policy.allowedDays.length > 0) {
      return policy.allowedDays.filter(d => d && d !== 'All');
    }
  }
  return Array.isArray(lt.allowedDays) ? lt.allowedDays.filter(d => d && d !== 'All') : [];
};

const validateAllowedDaysForRange = (startDate, endDate, allowedDays, leaveName) => {
  const validAllowed = Array.isArray(allowedDays) ? allowedDays.filter(d => d && d !== 'All') : [];
  if (validAllowed.length === 0 || validAllowed.length >= 7) return null;

  const allowedSet = new Set(validAllowed.map(d => String(d).trim().toLowerCase()));
  const sUTC = parseDateUTC(startDate);
  const eUTC = parseDateUTC(endDate || startDate);
  if (isNaN(sUTC.getTime()) || isNaN(eUTC.getTime())) return null;

  const cursor = new Date(sUTC);
  while (cursor.getTime() <= eUTC.getTime()) {
    const dayName = DAY_NAMES[cursor.getUTCDay()];
    if (!allowedSet.has(dayName.toLowerCase())) {
      return `${leaveName || 'This leave'} is only applicable on ${validAllowed.join(', ')}. Selected date (${cursor.toISOString().slice(0, 10)}, ${dayName}) is not allowed.`;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
};

const getEffectiveMaxAdvanceDays = async (user, companyId, lt) => {
  if (!lt) return 0;
  const policy = lt._id ? await policyService.policyForType(companyId, lt._id) : null;
  let matchedRule = null;
  if (policy && user) {
    const rules = await policyService.rulesForPolicies([policy._id]);
    matchedRule = policyService.resolveRule(user, rules);
  }
  return policyService.resolveMaxAdvanceDays(lt, policy, matchedRule);
};

const validateAdvanceDaysForRange = (startDate, endDate, maxAdvanceDays, leaveName, now = new Date()) => {
  const limitDays = Number(maxAdvanceDays);
  if (!limitDays || limitDays <= 0) return null;

  const todayUTC = parseDateUTC(now);
  const maxUTC = new Date(todayUTC);
  maxUTC.setUTCDate(maxUTC.getUTCDate() + (limitDays - 1));

  const sUTC = parseDateUTC(startDate);
  const eUTC = parseDateUTC(endDate || startDate);
  if (isNaN(sUTC.getTime()) || isNaN(eUTC.getTime())) return null;

  const maxDateStr = maxUTC.toISOString().slice(0, 10);
  if (sUTC.getTime() > maxUTC.getTime() || eUTC.getTime() > maxUTC.getTime()) {
    const offending = sUTC.getTime() > maxUTC.getTime() ? sUTC : eUTC;
    const dayName = DAY_NAMES[offending.getUTCDay()];
    return `${leaveName || 'This leave'} can only be applied within ${limitDays} day(s) from today (up to ${maxDateStr}). Selected date (${offending.toISOString().slice(0, 10)}, ${dayName}) exceeds the policy limit.`;
  }
  return null;
};

exports.validateAdvanceDaysForRange = validateAdvanceDaysForRange;

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { leaveType, startDate, endDate, reason, duration, startTime, endTime, session } = req.body;

    const companyId = req.tenant?.companyId || req.user?.companyId || null;

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

    const effectiveDuration = duration || 'Full Day';
    const startStr = new Date(startDate).toISOString().slice(0, 10);
    const endStr = new Date(endDate || startDate).toISOString().slice(0, 10);
    const isMultiDay = effectiveDuration === 'Multiple Days' || (effectiveDuration === 'Full Day' && startStr !== endStr);

    const actualEndDate = (effectiveDuration === 'Half Day' || (effectiveDuration === 'Full Day' && !isMultiDay))
      ? startDate
      : (endDate || startDate);

    if (effectiveDuration === 'Half Day' && !allowHalf) {
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

    if (effectiveDuration === 'Full Day' && !isMultiDay && !allowFull) {
      return res.status(400).json({
        success: false,
        message: `${lt.name} does not allow single Full Day leave applications.`,
      });
    }

    // Policy Rule: Allowed Days of the Month / Week check
    const effectiveAllowedDays = await getEffectiveAllowedDays(req.user, companyId, lt);
    const dayRuleError = validateAllowedDaysForRange(startDate, actualEndDate, effectiveAllowedDays, lt.name);
    if (dayRuleError) {
      return res.status(400).json({
        success: false,
        message: dayRuleError,
      });
    }

    // Policy Rule: Max Advance Application Days check
    const effectiveMaxAdvanceDays = await getEffectiveMaxAdvanceDays(req.user, companyId, lt);
    const advanceRuleError = validateAdvanceDaysForRange(startDate, actualEndDate, effectiveMaxAdvanceDays, lt.name);
    if (advanceRuleError) {
      return res.status(400).json({
        success: false,
        message: advanceRuleError,
      });
    }

    let finalSession = null;
    let finalStartTime = undefined;
    let finalEndTime = undefined;

    if (effectiveDuration === 'Half Day') {
      const User = require('../models/User');
      const userDoc = await User.findById(userId).populate('shift').lean();
      const shift = userDoc?.shift;

      finalSession = session || null;
      if (!finalSession) {
        if (startTime && startTime >= '13:00') {
          finalSession = 'Session 2';
        } else {
          finalSession = 'Session 1';
        }
      }

      if (finalSession === 'Session 1') {
        finalStartTime = shift?.firstSession?.startTime || shift?.startTime || startTime || '09:30';
        finalEndTime = shift?.firstSession?.endTime || endTime || '14:00';
      } else if (finalSession === 'Session 2') {
        finalStartTime = shift?.secondSession?.startTime || startTime || '14:00';
        finalEndTime = shift?.secondSession?.endTime || shift?.endTime || endTime || '18:00';
      } else {
        finalStartTime = startTime;
        finalEndTime = endTime;
      }
    }

    const requestedDays = effectiveDuration === 'Half Day' ? 0.5 : leaveBalanceService.calculateLeaveDays(
      { startDate, endDate: actualEndDate, duration: effectiveDuration },
      await leaveBalanceService.getCompanyLeaveContext(companyId)
    );

    // Policy-aware over-limit guard: approved + pending + this request must
    // fit within the effective entitlement (policy rule or legacy limit).
    const isMonthly = (lt.limitType || '').toLowerCase() === 'monthly' || (lt.code || '').toUpperCase() === 'CL';
    const leaveRefDate = new Date(startDate);
    const check = await leaveBalanceService.canApplyForLeave(userId, companyId, lt, requestedDays, leaveRefDate);
    if (!check.allowed && check.hasLimit !== false) {
      const limitLabel = isMonthly ? 'monthly' : 'yearly';
      return res.status(400).json({
        success: false,
        message: `${lt.name} limit reached (Max ${check.limit} per ${limitLabel}). Available: ${Math.max(0, check.remaining).toFixed(1)} day(s).`,
      });
    }

    // Determine the allocation period + policy snapshot at application time.
    const policy = await policyService.policyForType(companyId, lt._id);
    const period = policy
      ? periodService.getPeriodWindow(policy.periodType, leaveRefDate)
      : periodService.getPeriodWindow(isMonthly ? 'MONTHLY' : 'YEARLY', leaveRefDate);
    const policySnapshot = await policyService.buildPolicySnapshot(req.user, companyId, lt._id, leaveRefDate);

    // Freeze the reporting manager as approver at creation time.
    const approverId = req.user.reportsTo || req.user.approver || null;

    const leave = await Leave.create({
      user: userId,
      companyId,
      leaveType: lt.name,
      leaveTypeRef: lt._id,
      startDate,
      endDate: actualEndDate,
      reason,
      duration: effectiveDuration,
      session: finalSession,
      startTime: finalStartTime,
      endTime: finalEndTime,
      status: 'Pending', // Force pending on application
      periodKey: period.periodKey,
      policySnapshot,
      durationDays: requestedDays,
      approverId,
    });

    // Trigger notification to the reporting manager (approver)
    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      await autoNotif.triggerLeaveRequested(
        approverId,
        `${req.user.name || 'Staff'}`,
        `${lt.name} (${duration})`,
        io,
        req.tenant?.companyId || req.user?.companyId || null,
        leave._id
      );
    } catch (e) {
      console.error('[Leave Request Alert] Failed to send manager notification:', e.message);
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
    const { startDate, endDate } = req.query;

    const query = { user: userId };
    if (startDate || endDate) {
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.startDate = { $lte: end };
        query.endDate = { $gte: start };
      } else if (startDate) {
        query.startDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.endDate = { $lte: end };
      }
    }

    const leaves = await Leave.find(query)
      .populate('actionedBy', 'name fullName role roleCode designation')
      .populate('approverId', 'name fullName designation')
      .sort('-createdAt')
      .lean();
    const rawQuotas = await leaveBalanceService.getEmployeeQuotas(userId, companyId);
    const quotas = (rawQuotas || []).filter(q => !q.ineligible);
    const userDoc = await User.findById(userId)
      .populate('shift')
      .populate('reportsTo', 'name fullName employeeIdCode designation')
      .populate('approver', 'name fullName employeeIdCode designation')
      .lean();

    const approverObj = userDoc?.reportsTo || userDoc?.approver;
    const approverName = approverObj
      ? (approverObj.fullName || approverObj.name || approverObj.employeeIdCode || null)
      : null;

    res.status(200).json({
      success: true,
      count: leaves.length,
      quotas,
      shift: userDoc?.shift || null,
      approverName: approverName || null,
      reportingManager: approverName || null,
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    let filter = { ...(companyId ? { companyId : companyId } : {}) };
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.startDate = { $lte: end };
      filter.endDate = { $gte: start };
    }

    const allLeaves = await Leave.find(filter)
      .populate({
        path: 'user',
        select: 'name email department profileImage designation employeeIdCode phone role roleCode departmentAdminType adminType reportsTo',
        populate: { path: 'reportsTo', select: 'name fullName' },
      })
      .populate('actionedBy', 'name fullName role roleCode designation')
      .populate('approverId', 'name fullName designation')
      .sort('-createdAt')
      .lean();

    const leaves = allLeaves
      .filter(l => {
        if (!l.user) return false;
        if (isCompanyAdminUser(l.user)) return false;
        const uRole = (l.user.role || '').toLowerCase();
        const uRoleCode = (l.user.roleCode || '').toUpperCase();
        if (EXCLUDED_ADMIN_ROLES.includes(uRole) || uRoleCode === 'TCSA1' || uRoleCode === 'TCCA1') return false;
        return true;
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });

    if (!leave) {
      return res.status(404).json({ success: false, message: `Leave record ${req.params.id} not found` });
    }

    const oldStatus = leave.status;
    const { status } = req.body;
    const noteText = String(req.body.reason ?? req.body.rejectionReason ?? req.body.adminNote ?? '').trim();

    // Only allow approve/reject/cancel transitions; enforce that the acting
    // user is the employee's reporting manager (or Super/Company/HR Admin).
    const allowedTransitions = {
      Pending: ['Approved', 'Rejected', 'Cancelled'],
    };
    if (!status || oldStatus === 'Cancelled' || oldStatus === 'Rejected') {
      return res.status(400).json({ success: false, message: `Cannot change status from ${oldStatus}` });
    }
    if (oldStatus === 'Pending' && !allowedTransitions.Pending.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot change status to ${status}` });
    }
    if (status === 'Rejected' && !noteText) {
      return res.status(400).json({ success: false, message: 'Please provide a reason for rejection' });
    }

    const effectiveCompanyId = leave.companyId || companyId;
    if (['Approved', 'Rejected'].includes(status)) {
      await approvalService.assertApprover(leave, req.user);
      leave.actionedBy = req.user._id || req.user.id;
      leave.actionedByName = req.user.fullName || req.user.name || 'Admin';
      leave.actionedAt = new Date();
    }
    if (status === 'Approved' && oldStatus !== 'Approved') {
      const posted = await approvalService.recordTransition(leave, 'Approved', effectiveCompanyId);
      if (posted) leave.ledgerPosted = true;
      const days = leave.duration === 'Half Day' ? 0.5 : (leave.durationDays || (Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1));
      const targetUser = await User.findById(leave.user);
      if (targetUser) {
        targetUser.leaveBalance = Math.max(0, (targetUser.leaveBalance || 0) - days);
        await targetUser.save();
      }
    }
    if (status === 'Cancel' || status === 'Cancelled') {
      await approvalService.recordTransition(leave, 'Cancelled', effectiveCompanyId);
    }

    if (status) leave.status = status;
    if (noteText) {
      leave.adminNote = noteText;
      if (status === 'Rejected') leave.rejectionReason = noteText;
    }

    await leave.save();

    // Deprecated: legacy Approval check. Ledger is now the single source for
    // used balance; keep auto-cancel of overbooked pending leaves as a guard.
    if (req.body.status === 'Approved' && oldStatus !== 'Approved') {
      try {
        const lt = await leaveBalanceService.resolveLeaveType(effectiveCompanyId, leave.leaveType);
        if (lt) {
          const check = await leaveBalanceService.canApplyForLeave(leave.user, effectiveCompanyId, lt, 0, new Date(leave.startDate));
          if (!check.allowed && check.used > check.limit) {
            const period = check.period;
            await Leave.updateMany({
              user: leave.user,
              ...(effectiveCompanyId ? { companyId: effectiveCompanyId } : {}),
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
        autoNotif.triggerLeaveApproved(leave.user, leave.leaveType, io, leave._id);
      } else if (status === 'Rejected') {
        autoNotif.triggerLeaveRejected(leave.user, leave.leaveType, noteText || '', io, leave._id);
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filters = {
      ...(companyId ? { companyId } : {}),
    };

    // Mobile-only endpoint: every user (incl. management/admin roles) sees ONLY their direct reports' leaves.
    // Org-wide approval is done from the admin website (PATCH /leaves/:id).
    const isGlobalOrCompanyAdmin = false;

    const User = require('../models/User');
    const myDirectReports = await User.find({ reportsTo: req.user.id }).select('_id').lean();
    const directReportIds = myDirectReports.map((u) => u._id);
    const hasSubordinates = directReportIds.length > 0;

    // Check if Leave Approvals screen is blocked for this user via MobileAppConfig
    if (!isGlobalOrCompanyAdmin && companyId) {
      try {
        const MobileAppConfig = require('../models/MobileAppConfig');
        const Level = require('../models/Level');
        const { getEffectiveLevelNumber, getEffectiveCategory } = require('../middleware/rbac');

        const config = await MobileAppConfig.findOne({ companyId });
        if (config && config.screenRules) {
          const leaveAppRule = config.screenRules.find(r => r.screenKey === 'leaveApprovals');
          if (leaveAppRule) {
            if (!leaveAppRule.enabled) {
              return res.status(200).json({ success: true, count: 0, hasSubordinates: false, data: [] });
            }

            // Department restriction
            if (leaveAppRule.departments && leaveAppRule.departments.length > 0) {
              const uDept = (req.user.department || '').trim();
              if (!uDept || !leaveAppRule.departments.includes(uDept)) {
                return res.status(200).json({ success: true, count: 0, hasSubordinates: false, data: [] });
              }
            }

            // Resolve user level
            let userLevel = null;
            if (req.user.levelRef) {
              userLevel = (typeof req.user.levelRef === 'object' && req.user.levelRef.levelNumber !== undefined)
                ? req.user.levelRef
                : await Level.findById(req.user.levelRef._id || req.user.levelRef);
            }

            let userLevelNumber = null;
            if (userLevel?.levelNumber != null) {
              userLevelNumber = Number(userLevel.levelNumber);
            } else if (req.user.roleLevel != null && req.user.roleLevel >= 1) {
              userLevelNumber = Number(req.user.roleLevel);
            } else {
              const lvl = getEffectiveLevelNumber(req.user);
              if (lvl && lvl !== 99) userLevelNumber = Number(lvl);
            }

            // Check blocked levels
            if (leaveAppRule.blockedLevels && leaveAppRule.blockedLevels.length > 0 && userLevelNumber != null) {
              if (leaveAppRule.blockedLevels.map(Number).includes(userLevelNumber)) {
                return res.status(200).json({ success: true, count: 0, hasSubordinates: false, data: [] });
              }
            }

            // Check blocked categories
            const userCat = userLevel?.category || getEffectiveCategory(req.user) || req.user.effectiveCategory;
            if (leaveAppRule.blockedCategories && leaveAppRule.blockedCategories.length > 0 && userCat) {
              if (leaveAppRule.blockedCategories.map(c => String(c).toUpperCase()).includes(String(userCat).toUpperCase())) {
                return res.status(200).json({ success: true, count: 0, hasSubordinates: false, data: [] });
              }
            }

            // Check blocked specific employees
            if (leaveAppRule.blockedEmployees && leaveAppRule.blockedEmployees.length > 0) {
              const empIds = leaveAppRule.blockedEmployees.map(id => (id._id || id.id || id).toString());
              if (empIds.includes(req.user.id.toString())) {
                return res.status(200).json({ success: true, count: 0, hasSubordinates: false, data: [] });
              }
            }
          }
        }
      } catch (confErr) {
        console.warn('[getMyApprovals] MobileAppConfig check error:', confErr.message);
      }
    }

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
      .populate('actionedBy', 'name fullName role roleCode designation')
      .populate('approverId', 'name fullName designation')
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

// @desc    Approve a leave request (reporting manager or Super/Company/HR admin)
// @route   PATCH /api/leaves/approvals/:id/approve
// @access  Private (reporting manager or admin)
exports.approveLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ success: false, message: 'Leave is not pending' });

    await approvalService.assertApprover(leave, req.user, { directOnly: true });
    const effectiveCompanyId = leave.companyId || companyId;
    const posted = await approvalService.recordTransition(leave, 'Approved', effectiveCompanyId);
    if (posted) leave.ledgerPosted = true;

    const noteText = String(req.body.reason ?? req.body.adminNote ?? '').trim();
    leave.status = 'Approved';
    leave.actionedBy = req.user._id || req.user.id;
    leave.actionedByName = req.user.fullName || req.user.name || 'Admin';
    leave.actionedAt = new Date();
    if (noteText) leave.adminNote = noteText;
    await leave.save();

    // Deduct employee leave balance
    const days = leave.duration === 'Half Day' ? 0.5 : (leave.durationDays || (Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1));
    const targetUser = await User.findById(leave.user);
    if (targetUser) {
      targetUser.leaveBalance = Math.max(0, (targetUser.leaveBalance || 0) - days);
      await targetUser.save();
    }

    res.status(200).json({ success: true, data: leave });

    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      autoNotif.triggerLeaveApproved(leave.user, leave.leaveType, io, leave._id);
    } catch (_) {}
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Reject a leave request (reporting manager or Super/Company/HR admin)
// @route   PATCH /api/leaves/approvals/:id/reject
// @access  Private (reporting manager or admin)
exports.rejectLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ success: false, message: 'Leave is not pending' });

    const noteText = String(req.body.reason ?? req.body.rejectionReason ?? req.body.adminNote ?? '').trim();
    if (!noteText) {
      return res.status(400).json({ success: false, message: 'Please provide a reason for rejection' });
    }

    await approvalService.assertApprover(leave, req.user, { directOnly: true });

    leave.status = 'Rejected';
    leave.adminNote = noteText;
    leave.rejectionReason = noteText;
    leave.actionedBy = req.user._id || req.user.id;
    leave.actionedByName = req.user.fullName || req.user.name || 'Admin';
    leave.actionedAt = new Date();
    await leave.save();

    res.status(200).json({ success: true, data: leave });

    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      autoNotif.triggerLeaveRejected(leave.user, leave.leaveType, noteText, io, leave._id);
    } catch (_) {}
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// @desc    Cancel my leave request (Employee)
// @route   PATCH /api/leaves/cancel/:id
// @access  Private
exports.cancelLeave = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
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
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const leave = await Leave.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (leave.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Can only update pending requests' });
    }

    const { leaveType, startDate, endDate, reason, duration, startTime, endTime, session } = req.body;
    const updateData = {};
    if (leaveType) updateData.leaveType = leaveType;
    if (startDate) updateData.startDate = startDate;
    const effDuration = duration || leave.duration || 'Full Day';
    if (duration) updateData.duration = duration;
    if (endDate || startDate) {
      if (effDuration === 'Multiple Days') {
        updateData.endDate = endDate || startDate || leave.endDate;
      } else {
        updateData.endDate = startDate || leave.startDate;
      }
    }
    if (reason) updateData.reason = reason;

    if (effDuration === 'Half Day') {
      let finalSession = session || leave.session || null;
      if (!finalSession) {
        if (startTime && startTime >= '13:00') finalSession = 'Session 2';
        else finalSession = 'Session 1';
      }
      const User = require('../models/User');
      const userDoc = await User.findById(req.user.id).populate('shift').lean();
      const shift = userDoc?.shift;

      updateData.session = finalSession;
      if (finalSession === 'Session 1') {
        updateData.startTime = shift?.firstSession?.startTime || shift?.startTime || startTime || '09:30';
        updateData.endTime = shift?.firstSession?.endTime || endTime || '14:00';
      } else if (finalSession === 'Session 2') {
        updateData.startTime = shift?.secondSession?.startTime || startTime || '14:00';
        updateData.endTime = shift?.secondSession?.endTime || shift?.endTime || endTime || '18:00';
      } else {
        updateData.startTime = startTime;
        updateData.endTime = endTime;
      }
    } else {
      updateData.session = null;
      updateData.startTime = null;
      updateData.endTime = null;
    }

    const calcEnd = updateData.endDate || leave.endDate;
    const calcStart = updateData.startDate || leave.startDate;
    const targetTypeName = leaveType || leave.leaveType;
    const ltForUpdate = await leaveBalanceService.resolveLeaveType(companyId, leaveType || leave.leaveTypeRef || targetTypeName);
    if (ltForUpdate && leaveType) {
      updateData.leaveType = ltForUpdate.name;
      updateData.leaveTypeRef = ltForUpdate._id;
    }
    if (ltForUpdate) {
      const effectiveAllowedDays = await getEffectiveAllowedDays(req.user, companyId, ltForUpdate);
      const dayRuleError = validateAllowedDaysForRange(calcStart, calcEnd, effectiveAllowedDays, ltForUpdate.name);
      if (dayRuleError) {
        return res.status(400).json({
          success: false,
          message: dayRuleError,
        });
      }
      const effectiveMaxAdvanceDays = await getEffectiveMaxAdvanceDays(req.user, companyId, ltForUpdate);
      const advanceRuleError = validateAdvanceDaysForRange(calcStart, calcEnd, effectiveMaxAdvanceDays, ltForUpdate.name);
      if (advanceRuleError) {
        return res.status(400).json({
          success: false,
          message: advanceRuleError,
        });
      }
    }
    updateData.durationDays = effDuration === 'Half Day' ? 0.5 : (Math.max(1, Math.ceil((new Date(calcEnd) - new Date(calcStart)) / (1000 * 60 * 60 * 24)) + 1));

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
    const { startDate, endDate, search, exportAll } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const companyId = req.tenant?.companyId || req.user?.companyId || null;

    let filter = { ...(companyId ? { companyId : companyId } : {}) };
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.$or = [
        { startDate: { $lte: end }, endDate: { $gte: start } },
        { status: 'Pending' }
      ];
    }

    const employees = await User.find({
      ...(companyId ? { companyId } : {}),
      role: { $nin: EXCLUDED_ADMIN_ROLES },
      roleCode: { $nin: ['TCSA1', 'TCCA1'] }
    }).select('name designation department profileImage leaveBalance monthlyLeaveLimit role employeeIdCode');
    const employeeIds = employees.map(emp => emp._id);
    const employeeIdSet = new Set(employeeIds.map(id => id.toString()));
    const rawLeaves = (await Leave.find(filter).lean()).filter(l => l.user && employeeIdSet.has(l.user.toString()));
    const allLeaves = rawLeaves.map(l => {
      const item = { ...l };
      const s = (item.status || '').toLowerCase().trim();
      if (s === 'cancel' || s === 'cancelled') {
        item.status = 'Cancelled';
      } else if (s === 'approved') {
        item.status = 'Approved';
      } else if (s === 'rejected') {
        item.status = 'Rejected';
      } else if (s === 'pending') {
        item.status = 'Pending';
      }
      return item;
    });
    
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

    const buildEmployeeData = (emp) => {
      const empLeaves = allLeaves.filter(l => l.user.toString() === emp._id.toString());
      const empQuotas = quotasMap.get(emp._id.toString()) || [];

      const fullDaysCount = empLeaves
        .filter(l => l.status === 'Approved' && (l.duration === 'Full Day' || l.duration === 'Multiple Days' || l.duration !== 'Half Day'))
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
        const isUnlimited = lt.hasLimit === false || (quota && quota.hasLimit === false);
        const limit = isUnlimited ? 'No Limit' : (quota ? quota.limit : (typeof lt.limit === 'number' ? lt.limit : (emp.leaveBalance || 12)));
        const balance = isUnlimited ? 'No Limit' : Math.max(0, limit - availed);
        const ltKey = lt.code || lt.name;

        if (quota && quota.ineligible) {
          // Employee is not eligible for this targeted leave type (e.g. Trainee/Intern)
          return;
        }

        stats.leaveTypes[ltKey] = {
          hasLimit: !isUnlimited,
          total: limit,
          limitType: lt.limitType || 'Yearly',
          availed: Math.round(availed * 2) / 2,
          balance: isUnlimited ? 'No Limit' : Math.round(balance * 2) / 2,
          pending: quota ? quota.pending : 0,
          fullCount: typeLeaves.filter(l => l.duration === 'Full Day' || l.duration === 'Multiple Days' || l.duration !== 'Half Day').length,
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
    };

    // Build stats for ALL employees (needed for summary totals)
    const allDashboardData = employees.map(buildEmployeeData);

    const totalFull = allDashboardData.reduce((acc, d) => acc + (d.stats.fullDays || 0), 0);
    const totalHalf = allDashboardData.reduce((acc, d) => acc + (d.stats.halfDays || 0), 0);
    const totalPending = allDashboardData.reduce((acc, d) => acc + (d.stats.pending || 0), 0);
    const totalApproved = allDashboardData.reduce((acc, d) => acc + (d.stats.approved || 0), 0);
    const totalRejected = allDashboardData.reduce((acc, d) => acc + (d.stats.rejected || 0), 0);
    const totalCancelled = allDashboardData.reduce((acc, d) => acc + (d.stats.cancelled || 0), 0);

    // Apply search filter if provided
    let filteredData = allDashboardData;
    if (search && search.trim()) {
      const query = search.trim().toLowerCase();
      filteredData = allDashboardData.filter(emp =>
        (emp.name || '').toLowerCase().includes(query) ||
        (emp.department || '').toLowerCase().includes(query)
      );
    }

    const totalCount = filteredData.length;
    const totalPages = Math.ceil(totalCount / limit);

    // If exportAll is requested, return all filtered data (for CSV/PDF exports)
    const paginatedData = exportAll === 'true' ? filteredData : filteredData.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      success: true,
      data: paginatedData,
      leaveTypes: activeLeaveTypes,
      totalCount,
      totalPages,
      currentPage: page,
      summary: {
        pending: totalPending,
        approved: totalApproved,
        rejected: totalRejected,
        cancelled: totalCancelled,
        totalFullDays: Math.round(totalFull * 2) / 2,
        totalHalfDays: Math.round(totalHalf * 2) / 2
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};