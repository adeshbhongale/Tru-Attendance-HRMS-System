const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { getEffectiveLevelNumber } = require('./rbac');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id || decoded.userId)
      .populate('levelRef')
      .populate('gradeRef')
      .populate('companyId');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account no longer exists' });
    }

    // Check status
    const statusUpper = (user.status || '').toUpperCase();
    if (statusUpper === 'DISABLED' || statusUpper === 'TERMINATED' || statusUpper === 'SUSPENDED' || statusUpper === 'LOCKED' || statusUpper === 'INACTIVE') {
      return res.status(401).json({ success: false, message: `Account is ${statusUpper}. Access revoked.` });
    }

    // Check token version (instant revocation on password change or termination)
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired or revoked. Please log in again.' });
    }

    // Attach tenant companyId
    const effectiveCompanyId = user.companyId?._id || user.companyId || user.company || null;
    user.companyId = effectiveCompanyId;

    // Check company status for non-superadmin users
    if (effectiveCompanyId && user.scope !== 'GLOBAL' && user.role !== 'superadmin' && user.role !== 'TCSA1') {
      const company = user.companyId?._id ? user.companyId : await Company.findById(effectiveCompanyId);
      if (company && (company.status === 'SUSPENDED' || company.status === 'INACTIVE' || company.status === 'inactive')) {
        return res.status(403).json({ success: false, message: 'Company account is inactive or suspended. Access denied.' });
      }
    }

    req.user = user;
    req.companyId = effectiveCompanyId;

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = (req.user?.role || '').toLowerCase();
    const userRoleCode = (req.user?.roleCode || '').toUpperCase();
    const userScope = req.user?.scope;

    const adminRoles = [
      'admin', 'superadmin', 'tcsa1', 'company_admin', 'tcca1',
      'hr', 'hr_admin', 'tcsf2a', 'store', 'store_admin', 'store_manager', 'tcstr1',
      'accounts', 'account_admin', 'finance', 'tcacc1'
    ];

    const hasMatchingRole = roles.some((r) => {
      const targetRole = r.toLowerCase();
      if (targetRole === 'admin') {
        return adminRoles.includes(userRole) || adminRoles.includes(userRoleCode.toLowerCase()) || userRole.includes('admin') || userRole.includes('hr') || userRole.includes('store') || userRole.includes('account');
      }
      if (targetRole === 'superadmin') {
        return userRole === 'superadmin' || userRoleCode === 'TCSA1' || userScope === 'GLOBAL';
      }
      return userRole === targetRole || userRoleCode.toLowerCase() === targetRole;
    });

    if (!hasMatchingRole) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

// Grant access based on level hierarchy (Lower level number = higher authority)
exports.authorizeLevel = (maxLevel) => {
  return (req, res, next) => {
    const level = getEffectiveLevelNumber(req.user);
    if (level <= maxLevel) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Insufficient role level authority. Level ${maxLevel} or higher required (Your Level: ${level}).`,
    });
  };
};
