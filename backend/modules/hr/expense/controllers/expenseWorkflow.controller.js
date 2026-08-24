const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const Company = require('../../../../models/Company');
const User = require('../../../../models/User');

const resolveTenantCompanyId = async (req) => {
  let companyId = req.headers['x-company-id'] || req.query.companyId || req.body?.companyId || req.tenant?.companyId || req.companyId || req.user?.companyId || req.user?.company || null;
  if (companyId && typeof companyId === 'object' && companyId._id) {
    companyId = companyId._id;
  }
  if (companyId === 'ALL' || companyId === 'all') {
    return 'ALL';
  }
  if (!companyId && (req.user?.role === 'superadmin' || req.user?.role === 'super_admin' || req.user?.roleCode === 'TCSA1' || req.user?.scope === 'GLOBAL')) {
    return 'ALL';
  }
  return companyId;
};

const AUDIT = {
  async log({ req, action, claim, description, metadata }) {
    try {
      const companyId = await resolveTenantCompanyId(req);
      await ExpenseAuditLog.create({
        companyId: companyId && companyId !== 'ALL' ? companyId : (claim && claim.companyId) || null,
        company: companyId && companyId !== 'ALL' ? companyId : (claim && claim.companyId) || null,
        action,
        entity: 'ExpenseClaim',
        entityId: claim ? claim._id.toString() : '',
        claimNumber: claim ? claim.claimNumber : '',
        user: req.user?._id || req.user?.id || null,
        userName: req.user?.name || '',
        description: description || action,
        metadata: metadata || {},
      });
    } catch (err) { }
  },
};

const STAFF_ROLES = ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1', 'hr', 'hr_admin', 'tcsf2a', 'tcsfa', 'accounts', 'account_admin', 'finance', 'tcacc1', 'tcacc2'];

function isRole(user, targets) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  const roleCode = String(user.roleCode || '').toUpperCase();
  return targets.some(t => {
    const targetStr = String(t).toLowerCase();
    return (
      role === targetStr ||
      roleCode === String(t).toUpperCase() ||
      (targetStr === 'admin' && ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1'].includes(role))
    );
  });
}

const isHR = (u) => isRole(u, ['hr', 'hr_admin', 'tcsf2a', 'tcsfa', 'admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1']);
const isAccounts = (u) => isRole(u, ['accounts', 'account_admin', 'finance', 'tcacc1', 'tcacc2', 'admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1']);

/**
 * GET /api/expense/hr/pending — HR queue (only when approval enabled)
 */
exports.hrPending = async (req, res) => {
  try {
    if (!isHR(req.user)) return res.status(403).json({ success: false, message: 'HR or Admin role required.' });
    const companyId = await resolveTenantCompanyId(req);
    const filter = { status: 'HR_PENDING' };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;

    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department')
      .populate('companyId', 'name code')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/hr-decision  { action: 'approved'|'rejected', remarks }
 */
exports.hrDecision = async (req, res) => {
  try {
    if (!isHR(req.user)) return res.status(403).json({ success: false, message: 'HR or Admin role required.' });
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
    if (claim.status !== 'HR_PENDING') {
      return res.status(400).json({ success: false, message: `Claim is ${claim.status}, not HR_PENDING.` });
    }
    const action = req.body.action === 'rejected' ? 'rejected' : 'approved';
    const remarks = req.body.remarks || '';

    claim.approvalHistory.push({
      user: req.user._id,
      role: req.user.role,
      action,
      timestamp: new Date(),
      remarks,
    });
    claim.hrReviewedAt = new Date();
    claim.hrReviewedBy = req.user._id;
    claim.hrRemarks = remarks;

    if (action === 'rejected') {
      claim.status = 'HR_REJECTED';
      claim.timeline.push({ action: 'HR_REJECTED', description: `HR rejected claim: ${remarks}`, user: req.user._id, timestamp: new Date() });
    } else {
      claim.status = 'ACCOUNTS_PENDING';
      claim.timeline.push({ action: 'ACCOUNTS_PENDING', description: 'HR approved. Forwarded to Accounts.', user: req.user._id, timestamp: new Date() });
    }
    await claim.save();

    await AUDIT.log({
      req,
      action: action === 'approved' ? 'HR_APPROVED' : 'HR_REJECTED',
      claim,
      description: `HR ${action} claim ${claim.claimNumber}.`,
      metadata: { remarks },
    });

    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/accounts/pending — Accounts & Admin queue
 */
exports.accountsPending = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return res.status(403).json({ success: false, message: 'Accounts or Admin role required.' });
    const companyId = await resolveTenantCompanyId(req);
    const filter = {
      status: { $in: ['ACCOUNTS_PENDING', 'SUBMITTED'] },
    };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;

    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department')
      .populate('companyId', 'name code')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/disburse
 * Accounts / Admin disbursement. body: { paymentMethod, utr, paidAmount, remarks }
 */
exports.disburseClaim = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return res.status(403).json({ success: false, message: 'Accounts or Admin role required.' });
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
    if (claim.status !== 'ACCOUNTS_PENDING' && claim.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, message: `Claim is in ${claim.status} status. It must be verified and approved by HR Admin before Accounts disbursement.` });
    }

    const body = req.body || {};
    const paidAmount = Number(body.paidAmount || claim.grandAllowed || claim.grandRequested || 0);

    claim.disbursement = {
      paidAmount,
      paidAt: new Date(),
      paidBy: req.user._id,
      paymentMethod: body.paymentMethod || 'Bank Transfer (NEFT)',
      utr: body.utr || '',
      remarks: body.remarks || '',
    };
    claim.status = 'PAID';
    claim.paymentStatus = 'PAID';
    claim.timeline.push({
      action: 'PAID',
      description: `Disbursed ₹${paidAmount} via ${body.paymentMethod || 'Bank Transfer'}${body.utr ? ` (UTR: ${body.utr})` : ''}.`,
      user: req.user._id,
      timestamp: new Date(),
    });
    await claim.save();

    await AUDIT.log({
      req,
      action: 'DISBURSED',
      claim,
      description: `Claim ${claim.claimNumber} marked as PAID (₹${paidAmount}).`,
      metadata: { paidAmount, utr: body.utr, paymentMethod: body.paymentMethod },
    });

    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/accounts-decision  { action: 'approved'|'rejected', remarks, paidAmount, paymentMethod, utr }
 */
exports.accountsDecision = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return res.status(403).json({ success: false, message: 'Accounts or Admin role required.' });
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
    if (claim.status === 'HR_PENDING') {
      return res.status(400).json({ success: false, message: 'Claim requires HR Admin verification and approval before Accounts review.' });
    }

    const action = req.body.action === 'rejected' ? 'rejected' : 'approved';
    const remarks = req.body.remarks || '';

    if (action === 'rejected') {
      claim.status = 'ACCOUNTS_REJECTED';
      claim.paymentStatus = 'REJECTED';
      claim.accountsRemarks = remarks;
      claim.disbursedBy = req.user._id;
      claim.approvalHistory.push({
        user: req.user._id,
        role: req.user.role,
        action: 'rejected',
        timestamp: new Date(),
        remarks,
      });
      claim.timeline.push({
        action: 'ACCOUNTS_REJECTED',
        description: `Accounts / Admin rejected claim: ${remarks}`,
        user: req.user._id,
        timestamp: new Date(),
      });
      await claim.save();

      await AUDIT.log({
        req,
        action: 'ACCOUNTS_REJECTED',
        claim,
        description: `Accounts / Admin rejected claim ${claim.claimNumber}: ${remarks}`,
        metadata: { remarks },
      });

      return res.json({ success: true, data: claim });
    } else {
      return exports.disburseClaim(req, res);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/audit — audit trail
 */
exports.auditLogs = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const filter = {};
    if (companyId) filter.companyId = companyId;
    const logs = await ExpenseAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 200)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/dashboard-analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Aggregates summary KPIs, Employee-wise breakdown, and Project-wise breakdown
 */
exports.getExpenseDashboardAnalytics = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const { startDate, endDate } = req.query;

    const andConditions = [];
    if (companyId) andConditions.push({ companyId });

    // Exclude Draft claims entirely from the Dashboard (only show submitted, pending, paid, rejected)
    andConditions.push({ status: { $nin: ['DRAFT', 'draft', 'CREATED'] } });

    // Non-admin/staff employees can see their own data
    const isStaff = Boolean(
      String(req.user.role || '').toLowerCase().includes('admin') ||
      String(req.user.roleCode || '').toLowerCase().includes('admin') ||
      ['admin', 'company_admin', 'superadmin', 'tcsa1', 'hr', 'hr_admin', 'accounts', 'account_admin', 'finance', 'tcacc1', 'director', 'management'].some(
        r => String(r).toLowerCase() === String(req.user.role || '').toLowerCase() || String(req.user.roleCode || '').toLowerCase() === String(r).toLowerCase()
      )
    );
    if (!isStaff) {
      andConditions.push({
        $or: [
          { submittedBy: req.user._id },
          { 'employeeClaims.employee.employeeId': req.user._id },
        ]
      });
    }

    if (startDate || endDate) {
      const dateRange = {};
      if (startDate) {
        const [sY, sM, sD] = startDate.split('-').map(Number);
        const startIST = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0));
        startIST.setMinutes(startIST.getMinutes() - 330);
        dateRange.$gte = startIST;
      }
      if (endDate) {
        const [eY, eM, eD] = endDate.split('-').map(Number);
        const endIST = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999));
        endIST.setMinutes(endIST.getMinutes() - 330);
        dateRange.$lte = endIST;
      }

      andConditions.push({
        $or: [
          { createdAt: dateRange },
          { submittedAt: dateRange }
        ]
      });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department designation')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department designation')
      .sort({ createdAt: -1 })
      .lean();

    // Summary KPI calculation
    let totalSubmittedAmount = 0;
    let totalSubmittedCount = 0;
    let waitingApprovalAmount = 0;
    let waitingApprovalCount = 0;
    let waitingDisbursementAmount = 0;
    let waitingDisbursementCount = 0;
    let rejectedAmount = 0;
    let rejectedCount = 0;
    let settledAmount = 0;
    let settledCount = 0;
    let totalExcessAmount = 0;

    const employeeMap = {};
    const projectMap = {};

    claims.forEach(claim => {
      const status = (claim.status || '').toUpperCase();
      const reqAmt = claim.grandRequested || 0;
      const allowedAmt = claim.grandAllowed || 0;
      const excessAmt = claim.grandExcess || Math.max(0, reqAmt - allowedAmt);
      const paidAmt = claim.paidAmount || (['SETTLED', 'PAID', 'DISBURSED'].includes(status) ? (allowedAmt || reqAmt) : 0);

      const isWaitingApproval = ['SUBMITTED', 'HR_PENDING'].includes(status);
      const isWaitingDisbursement = ['ACCOUNTS_PENDING', 'ACCOUNTS_APPROVED'].includes(status);
      const isRejected = ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'].includes(status);
      const isSettled = ['SETTLED', 'PAID', 'DISBURSED'].includes(status);

      const effectiveExcessAmt = isSettled ? Math.max(0, reqAmt - paidAmt) : excessAmt;

      totalSubmittedAmount += reqAmt;
      totalSubmittedCount += 1;
      totalExcessAmount += effectiveExcessAmt;

      if (isWaitingApproval) {
        waitingApprovalAmount += allowedAmt;
        waitingApprovalCount += 1;
      } else if (isWaitingDisbursement) {
        waitingDisbursementAmount += allowedAmt;
        waitingDisbursementCount += 1;
      } else if (isRejected) {
        rejectedAmount += allowedAmt;
        rejectedCount += 1;
      } else if (isSettled) {
        settledAmount += paidAmt;
        settledCount += 1;
      }

      // Grouping by Employee:
      // Lodging expenses are attributed 100% to the applying user (submitter).
      // Tagged co-occupants receive 0 for lodging and only their own separate non-lodging items.
      const submitterId = String(claim.submittedBy?._id || claim.submittedBy || 'unknown');
      const empClaimList = (claim.employeeClaims && claim.employeeClaims.length > 0)
        ? claim.employeeClaims
        : [{
            employee: {
              employeeId: claim.submittedBy?._id || claim.submittedBy,
              name: claim.submittedBy?.name || claim.submittedByName || 'Unknown Employee',
              employeeIdCode: claim.submittedBy?.employeeIdCode || '',
              department: claim.submittedBy?.department || '',
              designation: claim.submittedBy?.designation || ''
            },
            items: [],
            requestedTotal: reqAmt,
            allowedTotal: allowedAmt,
            excessTotal: effectiveExcessAmt,
            itemCount: 1
          }];

      empClaimList.forEach(ec => {
        const emp = ec.employee || {};
        const empUser = (emp.employeeId && typeof emp.employeeId === 'object') ? emp.employeeId : null;
        const empId = String(empUser?._id || emp.employeeId || claim.submittedBy?._id || claim.submittedBy || 'unknown');
        const empName = empUser?.name || emp.name || claim.submittedBy?.name || claim.submittedByName || 'Unknown Employee';
        const empCode = empUser?.employeeIdCode || emp.employeeIdCode || claim.submittedBy?.employeeIdCode || '';
        const empDept = empUser?.department || emp.department || claim.submittedBy?.department || '';
        const empDesig = empUser?.designation || emp.designation || claim.submittedBy?.designation || '';

        const isSubmitter = empId === submitterId;

        // Calculate this employee's own items
        let ecReq = 0;
        let ecAllowed = 0;
        let ecExcess = 0;

        if (Array.isArray(ec.items) && ec.items.length > 0) {
          ec.items.forEach(it => {
            const isLodging = String(it.expenseType || '').toUpperCase() === 'LODGING';
            if (isLodging) {
              // Lodging expense only counts for the applicant who paid for the room
              if (isSubmitter) {
                ecReq += Number(it.requestedAmount || it.amount || 0);
                ecAllowed += Number(it.allowedAmount || it.requestedAmount || 0);
                ecExcess += Number(it.excessAmount || 0);
              }
            } else {
              // Non-lodging types (Food, Conveyance, Travel, etc.) count separately for this employee
              ecReq += Number(it.requestedAmount || it.amount || 0);
              ecAllowed += Number(it.allowedAmount || it.requestedAmount || 0);
              ecExcess += Number(it.excessAmount || 0);
            }
          });
        } else if (isSubmitter) {
          // Submitter with no item-level breakdown (e.g. single summary claim)
          ecReq = ec.requestedTotal !== undefined && ec.requestedTotal > 0 ? ec.requestedTotal : reqAmt;
          ecAllowed = ec.allowedTotal !== undefined && ec.allowedTotal > 0 ? ec.allowedTotal : allowedAmt;
          ecExcess = ec.excessTotal !== undefined && ec.excessTotal >= 0 ? ec.excessTotal : effectiveExcessAmt;
        } else {
          // Tagged co-occupant with 0 items (tagged only in shared lodging): 0 expense values
          ecReq = 0;
          ecAllowed = 0;
          ecExcess = 0;
        }

        // Only register employee in employeeWise if they have personal claims or are the submitter
        if (ecReq > 0 || isSubmitter) {
          if (!employeeMap[empId]) {
            employeeMap[empId] = {
              id: empId,
              employeeName: empName,
              employeeCode: empCode,
              department: empDept,
              designation: empDesig,
              expensesSubmitted: 0,
              totalSubmitted: 0,
              advanceAmount: 0,
              waitingForApproval: 0,
              waitingForDisbursement: 0,
              rejected: 0,
              settled: 0,
              excessAmount: 0,
            };
          }

          const ecPaid = isSettled ? (claim.paidAmount ? (ecReq > 0 ? (ecAllowed / (allowedAmt || 1)) * claim.paidAmount : 0) : (ecAllowed || ecReq)) : 0;

          employeeMap[empId].expensesSubmitted += 1;
          employeeMap[empId].totalSubmitted += ecReq;
          employeeMap[empId].excessAmount += ecExcess;

          if (isWaitingApproval) {
            employeeMap[empId].waitingForApproval += ecAllowed;
          } else if (isWaitingDisbursement) {
            employeeMap[empId].waitingForDisbursement += ecAllowed;
          } else if (isRejected) {
            employeeMap[empId].rejected += ecAllowed;
          } else if (isSettled) {
            employeeMap[empId].settled += ecPaid;
          }
        }
      });

      // Grouping by Project / Trip Purpose
      const projectName = claim.trip?.purpose || claim.trip?.customerName || claim.claimType || 'General Expenses';
      if (!projectMap[projectName]) {
        projectMap[projectName] = {
          projectName,
          destination: claim.trip?.destination || '',
          expensesSubmitted: 0,
          totalSubmitted: 0,
          advanceAmount: 0,
          waitingForApproval: 0,
          waitingForDisbursement: 0,
          rejected: 0,
          settled: 0,
          excessAmount: 0,
        };
      }
      projectMap[projectName].expensesSubmitted += 1;
      projectMap[projectName].totalSubmitted += reqAmt;
      projectMap[projectName].excessAmount += effectiveExcessAmt;
      if (isWaitingApproval) {
        projectMap[projectName].waitingForApproval += allowedAmt;
      } else if (isWaitingDisbursement) {
        projectMap[projectName].waitingForDisbursement += allowedAmt;
      } else if (isRejected) {
        projectMap[projectName].rejected += allowedAmt;
      } else if (isSettled) {
        projectMap[projectName].settled += paidAmt;
      }
    });

    const employeeWise = Object.values(employeeMap).map(e => ({
      ...e,
      totalSubmitted: Math.round(e.totalSubmitted * 100) / 100,
      advanceAmount: Math.round(e.advanceAmount * 100) / 100,
      waitingForApproval: Math.round(e.waitingForApproval * 100) / 100,
      waitingForDisbursement: Math.round(e.waitingForDisbursement * 100) / 100,
      rejected: Math.round(e.rejected * 100) / 100,
      settled: Math.round(e.settled * 100) / 100,
      excessAmount: Math.round(e.excessAmount * 100) / 100,
    })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

    const projectWise = Object.values(projectMap).map(p => ({
      ...p,
      totalSubmitted: Math.round(p.totalSubmitted * 100) / 100,
      advanceAmount: Math.round(p.advanceAmount * 100) / 100,
      waitingForApproval: Math.round(p.waitingForApproval * 100) / 100,
      waitingForDisbursement: Math.round(p.waitingForDisbursement * 100) / 100,
      rejected: Math.round(p.rejected * 100) / 100,
      settled: Math.round(p.settled * 100) / 100,
    })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const generatedOn = `${day}/${month}/${year} ${pad(hours)}:${minutes} ${ampm}`;

    const pendingTotalAmount = waitingApprovalAmount + waitingDisbursementAmount;
    const pendingTotalCount = waitingApprovalCount + waitingDisbursementCount;

    res.json({
      success: true,
      data: {
        summary: {
          totalSubmitted: { amount: Math.round(totalSubmittedAmount * 100) / 100, count: totalSubmittedCount },
          waitingForApproval: { amount: Math.round(pendingTotalAmount * 100) / 100, count: pendingTotalCount },
          pending: { amount: Math.round(pendingTotalAmount * 100) / 100, count: pendingTotalCount },
          rejected: { amount: Math.round(rejectedAmount * 100) / 100, count: rejectedCount },
          settled: { amount: Math.round(settledAmount * 100) / 100, count: settledCount },
          excess: { amount: Math.round(totalExcessAmount * 100) / 100 }
        },
        employeeWise,
        projectWise,
        generatedOn,
        dateRange: {
          startDate: startDate || '',
          endDate: endDate || ''
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
