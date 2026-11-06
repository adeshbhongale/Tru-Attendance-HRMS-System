const Company = require('../../../../models/Company');
const ExpenseFinanceHead = require('../models/ExpenseFinanceHead');
const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseType = require('../models/ExpenseType');
const access = require('../services/expenseAccess');
const finance = require('../services/financeApprovalService');

/**
 * CFO / Finance Head (2nd approver for configured claims), strictly one per company.
 * View: HR Admin, Company Admin, Super Admin. Add / change / remove: Company Admin and Super Admin only.
 */

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const canEdit = (u) => access.isSuperAdmin(u) || access.isCompanyAdmin(u);

/**
 * Resolve the target company strictly per tenant:
 * - Company Admin / HR Admin: always locked to their own company.
 * - Super Admin: uses the selected company (header / query / body / tenant), or first active company.
 */
async function resolveTenantCompanyId(req) {
  let companyId = access.resolveCompanyId(req);
  if (!companyId && access.isSuperAdmin(req.user)) {
    const firstComp = await Company.findOne({ status: { $nin: ['SUSPENDED', 'INACTIVE', 'inactive'] } }).select('_id').lean();
    if (firstComp) companyId = String(firstComp._id);
  }
  return companyId;
}

const resolveRulesPayload = (rec, activePolicy) => {
  const fromRecTypes = Array.isArray(rec?.applicableClaimTypes) ? rec.applicableClaimTypes : null;
  const fromPolTypes = Array.isArray(activePolicy?.cfoApprovalConfig?.applicableClaimTypes)
    ? activePolicy.cfoApprovalConfig.applicableClaimTypes
    : null;
  const applicableClaimTypes = fromRecTypes || fromPolTypes || ['STOCK_PURCHASE'];
  const applyOnFullPayment = rec?.applyOnFullPayment !== undefined
    ? rec.applyOnFullPayment !== false
    : (activePolicy?.cfoApprovalConfig?.applyOnFullPayment !== false);
  const enabled = activePolicy?.cfoApprovalConfig?.enabled !== false;
  return {
    enabled,
    applyOnFullPayment,
    applicableClaimTypes: [...new Set(applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))],
  };
};

const shape = (rec, rulesPayload = null) => {
  if (!rec || !rec.employee) return null;
  const e = rec.employee;
  return {
    _id: e._id,
    name: e.name || rec.employeeName || '',
    employeeIdCode: e.employeeIdCode || '',
    department: e.department || '',
    designation: e.designation || '',
    email: e.email || '',
    status: e.status || '',
    companyId: rec.companyId || e.companyId || e.company || null,
    updatedAt: rec.updatedAt || null,
    updatedByName: rec.updatedByName || '',
    ...(rulesPayload ? { cfoApprovalConfig: rulesPayload } : {}),
  };
};

/** GET /api/expense/finance-head */
exports.getFinanceHead = async (req, res) => {
  try {
    if (!access.isHR(req.user)) return fail(res, 403, 'You are not allowed to view the CFO / Finance Head setting.');
    const companyId = await resolveTenantCompanyId(req);
    if (!companyId) return fail(res, 422, 'Please select a company.');
    const [rec, activePolicy] = await Promise.all([
      finance.getFinanceHeadRecord(companyId),
      ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 }).lean().catch(() => null),
    ]);
    const cfoApprovalConfig = resolveRulesPayload(rec, activePolicy);
    res.json({
      success: true,
      companyId: String(companyId),
      data: shape(rec, cfoApprovalConfig),
      cfoApprovalConfig,
      canEdit: canEdit(req.user),
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

/** PUT /api/expense/finance-head  Body: { employeeId?, applyOnFullPayment?, applicableClaimTypes?, rulesOnly? } */
exports.setFinanceHead = async (req, res) => {
  try {
    if (!canEdit(req.user)) return fail(res, 403, 'Only Super Admin / Company Admin can add or change the CFO / Finance Head.');
    const companyId = await resolveTenantCompanyId(req);
    if (!companyId) return fail(res, 422, 'Please select a company.');
    const cfgBody = req.body?.cfoApprovalConfig && typeof req.body.cfoApprovalConfig === 'object'
      ? req.body.cfoApprovalConfig
      : req.body || {};
    const hasRulesUpdate = cfgBody?.applyOnFullPayment !== undefined
      || Array.isArray(cfgBody?.applicableClaimTypes)
      || cfgBody?.enabled !== undefined
      || Boolean(req.body?.rulesOnly);
    const rulesOnly = Boolean(req.body?.rulesOnly);
    const employeeId = req.body?.employeeId !== undefined ? String(req.body.employeeId || '').trim() : undefined;
    const previous = await finance.getFinanceHeadRecord(companyId);

    // Sync CFO approval rules to ExpensePolicy & ExpenseType when rules are updated
    if (hasRulesUpdate) {
      const activePol = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 });
      const prevCfg = resolveRulesPayload(previous, activePol);
      const nextEnabled = cfgBody?.enabled !== undefined ? Boolean(cfgBody.enabled) : prevCfg.enabled;
      const nextApplyFp = cfgBody?.applyOnFullPayment !== undefined ? Boolean(cfgBody.applyOnFullPayment) : prevCfg.applyOnFullPayment;
      const nextTypes = Array.isArray(cfgBody?.applicableClaimTypes)
        ? [...new Set(cfgBody.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))]
        : prevCfg.applicableClaimTypes;

      if (activePol) {
        activePol.cfoApprovalConfig = {
          enabled: nextEnabled,
          applyOnFullPayment: nextApplyFp,
          applicableClaimTypes: nextTypes,
        };
        await activePol.save();
      }
      await ExpenseType.updateMany({ companyId, code: { $in: nextTypes } }, { $set: { cfoApprovalRequired: true } }).catch(() => {});
      await ExpenseType.updateMany({ companyId, code: { $nin: nextTypes } }, { $set: { cfoApprovalRequired: false } }).catch(() => {});
      await ExpenseFinanceHead.updateOne(
        { companyId },
        {
          $set: {
            applyOnFullPayment: nextApplyFp,
            applicableClaimTypes: nextTypes,
          },
        }
      ).catch(() => {});

      if (rulesOnly || employeeId === undefined) {
        const updatedRec = await finance.getFinanceHeadRecord(companyId);
        const updatedPol = activePol || (await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 }).lean().catch(() => null));
        const cfoApprovalConfig = resolveRulesPayload(updatedRec, updatedPol);
        return res.json({
          success: true,
          companyId: String(companyId),
          data: shape(updatedRec, cfoApprovalConfig),
          cfoApprovalConfig,
          canEdit: true,
        });
      }
    }

    if (!employeeId) {
      await ExpenseFinanceHead.deleteOne({ companyId });
      await access.audit({
        req,
        action: 'FINANCE_HEAD_REMOVED',
        entity: 'ExpenseFinanceHead',
        entityId: String(companyId),
        claim: { companyId },
        description: `CFO / Finance Head removed${previous?.employee?.name ? ` (was ${previous.employee.name})` : ''}.`,
      });
      const activePol = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 }).lean().catch(() => null);
      const cfoApprovalConfig = resolveRulesPayload(null, activePol);
      return res.json({ success: true, companyId: String(companyId), data: null, cfoApprovalConfig, canEdit: true });
    }

    const emp = await finance.findSelectableEmployee(companyId, employeeId);
    if (!emp) return fail(res, 422, 'The selected employee is not an active employee of this company.');

    const activePol = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 }).lean().catch(() => null);
    const rulesToKeep = resolveRulesPayload(previous, activePol);

    await ExpenseFinanceHead.findOneAndUpdate(
      { companyId },
      {
        $set: {
          companyId,
          company: companyId,
          employee: emp._id,
          employeeName: emp.name || '',
          applyOnFullPayment: req.body?.applyOnFullPayment !== undefined ? Boolean(req.body.applyOnFullPayment) : rulesToKeep.applyOnFullPayment,
          applicableClaimTypes: Array.isArray(req.body?.applicableClaimTypes)
            ? [...new Set(req.body.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))]
            : rulesToKeep.applicableClaimTypes,
          updatedBy: req.user._id,
          updatedByName: req.user.name || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await access.audit({
      req,
      action: 'FINANCE_HEAD_SET',
      entity: 'ExpenseFinanceHead',
      entityId: String(companyId),
      claim: { companyId },
      description: `CFO / Finance Head set to ${emp.name}${previous?.employee?.name ? ` (was ${previous.employee.name})` : ''}.`,
      metadata: { companyId, employeeId: emp._id, previousEmployeeId: previous?.employee?._id || null },
    });
    const rec = await finance.getFinanceHeadRecord(companyId);
    const cfoApprovalConfig = resolveRulesPayload(rec, activePol);
    res.json({ success: true, companyId: String(companyId), data: shape(rec, cfoApprovalConfig), cfoApprovalConfig, canEdit: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
