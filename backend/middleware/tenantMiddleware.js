/**
 * Tenant Isolation & Company Context Middleware
 */

const mongoose = require('mongoose');
const Company = require('../models/Company');

const isGlobalUser = (user) => user?.scope === 'GLOBAL' || user?.role === 'superadmin' || user?.role === 'TCSA1' || user?.roleCode === 'TCSA1';

// Resolve one trusted request tenant. Only a global user may select a target company.
exports.tenantContext = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required before company scope check',
    });
  }

  let companyId = req.user.companyId || req.user.company || null;
  if (isGlobalUser(req.user)) {
    companyId = req.headers['x-company-id'] || req.query.companyId || companyId;
  }

  if (!companyId) {
    if (isGlobalUser(req.user)) {
      req.tenant = {
        companyId: null,
        userId: req.user._id || req.user.id,
        employeeId: req.user.employeeIdCode || req.user.employeeId,
        roleId: req.user.roleCode || req.user.role,
        scope: 'GLOBAL',
      };
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Company context missing. Every employee must belong to a specific company.',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ success: false, message: 'Invalid company context.' });
  }

  const company = await Company.findById(companyId).select('_id status').lean();
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found.' });
  }
  if (['SUSPENDED', 'INACTIVE', 'inactive'].includes(company.status)) {
    return res.status(403).json({ success: false, message: 'Company account is inactive or suspended.' });
  }

  req.companyId = companyId;
  req.tenant = {
    companyId,
    userId: req.user._id || req.user.id,
    employeeId: req.user.employeeIdCode || req.user.employeeId,
    roleId: req.user.roleCode || req.user.role,
    scope: req.user.scope || 'COMPANY',
  };
  next();
};

exports.requireCompany = exports.tenantContext;

// Prevent malicious payload tampering of companyId
exports.sanitizeTenantPayload = (req, res, next) => {
  if (req.tenant?.companyId) {
    if (req.body) req.body.companyId = req.tenant.companyId;
    if (req.query && !isGlobalUser(req.user)) req.query.companyId = req.tenant.companyId;
  }

  next();
};

// Validate that cross-referenced entity belongs to the exact same companyId
exports.validateCrossCompanyRef = async (Model, entityId, expectedCompanyId, entityName = 'Resource') => {
  if (!entityId) return true;
  const item = await Model.findById(entityId);
  if (!item) {
    throw new Error(`${entityName} not found.`);
  }
  const itemCompanyId = item.companyId || item.company;
  if (itemCompanyId && itemCompanyId.toString() !== expectedCompanyId.toString()) {
    throw new Error(`Cross-tenant violation: ${entityName} belongs to another company.`);
  }
  return true;
};
