const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
  }
  // else if (req.cookies.token) {
  //   token = req.cookies.token;
  // }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

// Grant access based on role level hierarchy
// Lower level number = more authority (Level 1 Manager > Level 5 Trainee)
// Super admin, company admin, and legacy admin always pass
exports.authorizeLevel = (maxLevel) => {
  return (req, res, next) => {
    // Global admins always pass
    if (['super_admin', 'company_admin', 'admin'].includes(req.user.role)) {
      return next();
    }
    // Check role level
    if (req.user.roleLevel && req.user.roleLevel <= maxLevel) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Insufficient role level. Level ${maxLevel} or higher authority required.`,
    });
  };
};
