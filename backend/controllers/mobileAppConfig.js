const MobileAppConfig = require('../models/MobileAppConfig');
const User = require('../models/User');
const Level = require('../models/Level');
const Department = require('../models/Department');
const { getEffectiveLevelNumber, getEffectiveCategory } = require('../middleware/rbac');

/**
 * Helper: Check if a user is blocked by a given access control rule set
 */
const isUserBlocked = (user, controlRules, userLevel) => {
  if (!controlRules) return false;

  const userRole = (user.role || '').trim().toLowerCase();
  const userRoleCode = (user.roleCode || '').trim().toUpperCase();
  const userDesignation = (user.designation || '').trim().toLowerCase();

  // Resolve level number reliably
  let userLevelNumber = null;
  if (userLevel && userLevel.levelNumber !== undefined && userLevel.levelNumber !== null) {
    userLevelNumber = Number(userLevel.levelNumber);
  } else if (user.levelRef && typeof user.levelRef === 'object' && user.levelRef.levelNumber !== undefined) {
    userLevelNumber = Number(user.levelRef.levelNumber);
  } else if (user.roleLevel != null && user.roleLevel >= 1) {
    userLevelNumber = Number(user.roleLevel);
  } else {
    const rbacLevel = getEffectiveLevelNumber(user);
    if (rbacLevel && rbacLevel !== 99) {
      userLevelNumber = Number(rbacLevel);
    }
  }

  // Resolve category reliably
  const userCategory = (userLevel?.category) || getEffectiveCategory(user) || user.effectiveCategory || null;
  const userId = (user._id || user.id || '').toString();

  // Check blocked roles (matches role, designation, or roleCode)
  if (controlRules.blockedRoles && controlRules.blockedRoles.length > 0) {
    const blockedLower = controlRules.blockedRoles.map(r => String(r).trim().toLowerCase());
    if (blockedLower.includes(userRole) || (userDesignation && blockedLower.includes(userDesignation))) return true;
  }

  // Check blocked role codes
  if (controlRules.blockedRoleCodes && controlRules.blockedRoleCodes.length > 0) {
    const blockedUpper = controlRules.blockedRoleCodes.map(r => String(r).trim().toUpperCase());
    if (blockedUpper.includes(userRoleCode)) return true;
  }

  // Check blocked categories
  if (controlRules.blockedCategories && controlRules.blockedCategories.length > 0 && userCategory) {
    const blockedCatUpper = controlRules.blockedCategories.map(c => String(c).trim().toUpperCase());
    if (blockedCatUpper.includes(String(userCategory).trim().toUpperCase())) return true;
  }

  // Check blocked levels (cast both sides to Number for foolproof match)
  if (controlRules.blockedLevels && controlRules.blockedLevels.length > 0 && userLevelNumber != null) {
    const blockedNums = controlRules.blockedLevels.map(Number);
    if (blockedNums.includes(Number(userLevelNumber))) return true;
  }

  // Check blocked specific employees
  if (controlRules.blockedEmployees && controlRules.blockedEmployees.length > 0) {
    const blockedIds = controlRules.blockedEmployees.map(id => (id._id || id.id || id).toString());
    if (blockedIds.includes(userId)) return true;
  }

  return false;
};

// @desc    Get mobile app config for a company
// @route   GET /api/mobile-config
// @access  Private/SuperAdmin
exports.getMobileAppConfig = async (req, res) => {
  try {
    const companyId = req.tenant?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company context required' });
    }

    let config = await MobileAppConfig.findOne({ companyId })
      .populate('screenRules.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
      .populate('loginControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
      .populate('trackingControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode');

    if (!config) {
      // Create default config
      config = await MobileAppConfig.create({
        companyId,
        screenRules: MobileAppConfig.getDefaultScreens(),
        loginControl: {},
        trackingControl: {},
      });
      config = await MobileAppConfig.findById(config._id)
        .populate('screenRules.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
        .populate('loginControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
        .populate('trackingControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode');
    }

    // Clean up any legacy trackMyRoute from screenRules if present
    if (config.screenRules && config.screenRules.some(r => r.screenKey === 'trackMyRoute')) {
      config.screenRules = config.screenRules.filter(r => r.screenKey !== 'trackMyRoute');
      await config.save();
    }

    // Also fetch company levels and departments for the admin UI dropdowns
    const [levels, deptDocs] = await Promise.all([
      Level.find({ companyId, status: 'active' }).sort({ levelNumber: 1 }),
      Department.find({ companyId }).select('name').lean()
    ]);

    const departments = deptDocs.map(d => d.name).filter(Boolean);

    res.status(200).json({
      success: true,
      data: config,
      levels: levels,
      departments: departments,
    });
  } catch (err) {
    console.error('[MobileAppConfig] getMobileAppConfig error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update mobile app config for a company
// @route   PUT /api/mobile-config
// @access  Private/SuperAdmin
exports.updateMobileAppConfig = async (req, res) => {
  try {
    const companyId = req.tenant?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company context required' });
    }

    const { screenRules, loginControl, trackingControl } = req.body;
    const updateData = { companyId };

    if (screenRules !== undefined) {
      // Filter out trackMyRoute
      updateData.screenRules = screenRules.filter(r => r.screenKey !== 'trackMyRoute');
    }
    if (loginControl !== undefined) {
      updateData.loginControl = loginControl;
    }
    if (trackingControl !== undefined) {
      updateData.trackingControl = trackingControl;
    }

    const config = await MobileAppConfig.findOneAndUpdate(
      { companyId },
      updateData,
      { new: true, runValidators: true, upsert: true }
    )
      .populate('screenRules.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
      .populate('loginControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode')
      .populate('trackingControl.blockedEmployees', 'name email mobile role roleCode employeeIdCode');

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (err) {
    console.error('[MobileAppConfig] updateMobileAppConfig error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get the logged-in user's mobile access permissions
// @route   GET /api/mobile-config/my-access
// @access  Private (any authenticated user)
exports.getMyMobileAccess = async (req, res) => {
  try {
    const user = req.user;
    const companyId = req.tenant?.companyId || user.companyId || user.company;

    if (!companyId) {
      return res.status(200).json({
        success: true,
        data: {
          loginAllowed: true,
          trackingEnabled: true,
          allowedScreens: MobileAppConfig.getDefaultScreens().map(s => s.screenKey),
          blockedScreens: [],
        },
      });
    }

    const config = await MobileAppConfig.findOne({ companyId });

    if (!config) {
      return res.status(200).json({
        success: true,
        data: {
          loginAllowed: true,
          trackingEnabled: true,
          allowedScreens: MobileAppConfig.getDefaultScreens().map(s => s.screenKey),
          blockedScreens: [],
        },
      });
    }

    // Resolve user level
    let userLevel = null;
    if (user.levelRef) {
      if (typeof user.levelRef === 'object' && user.levelRef.levelNumber !== undefined) {
        userLevel = user.levelRef;
      } else {
        const refId = user.levelRef._id || user.levelRef;
        userLevel = await Level.findById(refId);
      }
    }
    if (!userLevel && (user.roleLevel || user.roleCode)) {
      const lvlNum = getEffectiveLevelNumber(user);
      if (lvlNum && lvlNum !== 99 && companyId) {
        userLevel = await Level.findOne({ companyId, levelNumber: lvlNum });
      }
    }

    // Check if user has subordinates (reportsTo)
    const hasSubordinates = (await User.countDocuments({ companyId, reportsTo: user._id || user.id })) > 0;
    const userRole = (user.role || '').toLowerCase();
    const userRoleCode = (user.roleCode || '').toUpperCase();
    const isPrivilegedAdmin = userRole === 'admin' || userRole === 'superadmin' || userRoleCode === 'TCSA1' || userRoleCode === 'TCCA1';

    // Check login access
    const loginBlocked = isUserBlocked(user, config.loginControl, userLevel);

    // Check tracking access
    const trackingBlocked = isUserBlocked(user, config.trackingControl, userLevel);

    // Check screen access
    const allowedScreens = [];
    const blockedScreens = [];

    const defaultScreens = MobileAppConfig.getDefaultScreens();
    for (const defaultScreen of defaultScreens) {
      const rule = (config.screenRules || []).find(r => r.screenKey === defaultScreen.screenKey);
      if (!rule) {
        allowedScreens.push(defaultScreen.screenKey);
        continue;
      }
      if (!rule.enabled) {
        blockedScreens.push(defaultScreen.screenKey);
        continue;
      }

      // 1. Department restriction check (if departments specified, only users in those departments can see screen)
      if (rule.departments && rule.departments.length > 0) {
        const userDept = (user.department || '').trim();
        if (!userDept || !rule.departments.includes(userDept)) {
          blockedScreens.push(defaultScreen.screenKey);
          continue;
        }
      }

      // 2. Reports-To (Subordinates) restriction check (e.g. Leave Approvals)
      if (rule.requiresReportsTo) {
        if (!hasSubordinates && !isPrivilegedAdmin) {
          blockedScreens.push(defaultScreen.screenKey);
          continue;
        }
      }

      // 3. Category, Level, Specific Employee block check
      if (isUserBlocked(user, rule, userLevel)) {
        blockedScreens.push(defaultScreen.screenKey);
      } else {
        allowedScreens.push(defaultScreen.screenKey);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        loginAllowed: !loginBlocked,
        trackingEnabled: !trackingBlocked,
        allowedScreens,
        blockedScreens,
      },
    });
  } catch (err) {
    console.error('[MobileAppConfig] getMyMobileAccess error:', err.message);
    res.status(200).json({
      success: true,
      data: {
        loginAllowed: true,
        trackingEnabled: true,
        allowedScreens: MobileAppConfig.getDefaultScreens().map(s => s.screenKey),
        blockedScreens: [],
      },
    });
  }
};
