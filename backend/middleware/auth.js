const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

    req.user = await User.findById(decoded.id)
      .populate('levelRef')
      .populate('gradeRef');

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
