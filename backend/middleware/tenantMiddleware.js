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

  let company = null;
  if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
    company = await Company.findById(companyId).select('_id status').lean();
  }

  // Fallback to user's assigned company if header companyId was invalid/stale
  if (!company && req.user.companyId && mongoose.Types.ObjectId.isValid(req.user.companyId)) {
    company = await Company.findById(req.user.companyId).select('_id status').lean();
    if (company) {
      companyId = req.user.companyId;
    }
  }

  // Global/Admin fallback to primary active company
  if (!company && (isGlobalUser(req.user) || String(req.user.role || '').toLowerCase().includes('admin'))) {
    company = await Company.findOne({ status: { $nin: ['SUSPENDED', 'INACTIVE', 'inactive'] } }).select('_id status').lean();
    if (company) {
      companyId = company._id;
    }
  }

  if (!company) {
    return res.status(401).json({ success: false, message: 'Session expired or company context invalid. Please log in again.' });
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
