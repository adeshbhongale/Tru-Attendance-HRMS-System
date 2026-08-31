const { getEffectiveLevelNumber, getEffectiveCategory } = require('../middleware/rbac');

/**
 * Check if a user account is active
 * @param {Object} user - User document or lean object
 * @returns {boolean}
 */
const isUserActive = (user) => {
  if (!user) return false;
  const status = String(user.status || '').trim().toUpperCase();
  if (['INACTIVE', 'SUSPENDED', 'LOCKED', 'DISABLED', 'TERMINATED'].includes(status)) {
    return false;
  }
  if (status === 'ACTIVE') return true;
  if (String(user.status || '').toLowerCase() === 'active') return true;
  return false;
};

/**
 * Check if a user is blocked by an AccessControl rule set (e.g. trackingControl or loginControl)
 * @param {Object} user - User document
 * @param {Object} controlRules - { blockedRoles, blockedRoleCodes, blockedCategories, blockedLevels, blockedEmployees }
 * @param {Object} userLevel - Optional Level document
 * @returns {boolean}
 */
const isUserBlocked = (user, controlRules, userLevel = null) => {
  if (!controlRules || !user) return false;

  const userRole = (user.role || '').trim().toLowerCase();
  const userRoleCode = (user.roleCode || '').trim().toUpperCase();
  const userDesignation = (user.designation || '').trim().toLowerCase();

  // Resolve level number
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

  // Resolve category
  const userCategory = (userLevel?.category) || getEffectiveCategory(user) || user.effectiveCategory || null;
  const userId = (user._id || user.id || '').toString();

  // Check blocked roles
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

  // Check blocked levels
  if (controlRules.blockedLevels && controlRules.blockedLevels.length > 0 && userLevelNumber != null) {
    const blockedNums = controlRules.blockedLevels.map(Number);
    if (blockedNums.includes(Number(userLevelNumber))) return true;
  }

  // Check blocked specific employees
  if (controlRules.blockedEmployees && controlRules.blockedEmployees.length > 0) {
    const empIds = controlRules.blockedEmployees.map(id => (id._id || id.id || id).toString());
    if (empIds.includes(userId)) return true;
  }

  return false;
};

/**
 * Check if a specific screen/feature is blocked for a user
 * @param {Object} user - User document
 * @param {string|string[]} screenKeys - Screen key(s) to check (e.g. 'attendance', 'leave', 'customerVisit')
 * @param {Object} mobileConfig - MobileAppConfig document
 * @param {Object} userLevel - Optional Level document
 * @returns {boolean}
 */
const isUserScreenBlocked = (user, screenKeys, mobileConfig, userLevel = null) => {
  if (!user) return true;
  if (!isUserActive(user)) return true;
  if (!mobileConfig) return false;

  const keys = Array.isArray(screenKeys) ? screenKeys : [screenKeys];
  const screenRules = mobileConfig.screenRules || [];

  for (const key of keys) {
    const rule = screenRules.find(r => r.screenKey && r.screenKey.toLowerCase() === key.toLowerCase());
    if (!rule) continue;

    if (rule.enabled === false) return true;

    // Department check
    if (rule.departments && rule.departments.length > 0) {
      const userDept = (user.department || '').trim();
      if (!userDept || !rule.departments.includes(userDept)) return true;
    }

    if (isUserBlocked(user, rule, userLevel)) return true;
  }

  return false;
};

/**
 * Check if tracking is blocked/disabled for a user
 */
const isUserTrackingBlocked = (user, mobileConfig, userLevel = null) => {
  if (!user) return true;
  if (!isUserActive(user)) return true;
  if (!mobileConfig || !mobileConfig.trackingControl) return false;
  return isUserBlocked(user, mobileConfig.trackingControl, userLevel);
};

/**
 * Check if login is blocked for a user
 */
const isUserLoginBlocked = (user, mobileConfig, userLevel = null) => {
  if (!user) return true;
  if (!isUserActive(user)) return true;
  if (!mobileConfig || !mobileConfig.loginControl) return false;
  return isUserBlocked(user, mobileConfig.loginControl, userLevel);
};

/**
 * Check if attendance is blocked/disabled for a user
 */
const isUserAttendanceBlocked = (user, mobileConfig, userLevel = null) => {
  return isUserScreenBlocked(user, ['attendance'], mobileConfig, userLevel);
};

/**
 * Check if leave is blocked/disabled for a user
 */
const isUserLeaveBlocked = (user, mobileConfig, userLevel = null) => {
  return isUserScreenBlocked(user, ['leave', 'leaveApprovals'], mobileConfig, userLevel);
};

/**
 * Check if customer visits are blocked/disabled for a user
 */
const isUserVisitBlocked = (user, mobileConfig, userLevel = null) => {
  return isUserScreenBlocked(user, ['customerVisit', 'customer_visit', 'client_visit'], mobileConfig, userLevel);
};

/**
 * Check if shift management is blocked/disabled for a user
 */
const isUserShiftBlocked = (user, mobileConfig, userLevel = null) => {
  return isUserScreenBlocked(user, ['shift'], mobileConfig, userLevel);
};

/**
 * Master check: verify if an automated notification is blocked for an employee
 * based on Super Admin mobile config rules (tracking, attendance, leave, visit, shift, login, or active status)
 *
 * @param {Object} user - User document
 * @param {string} notifType - Notification type (e.g. 'attendance notification', 'tracing notification', 'customer visit notification', 'general notification')
 * @param {string} autoType - Automated notification sub-type (e.g. 'Employee late by grace time', 'Employee absent', 'Leave approved', 'Employee outside geofence')
 * @param {Object} mobileConfig - MobileAppConfig document
 * @param {Object} userLevel - Optional Level document
 * @returns {boolean} true if notification should be BLOCKED (not sent)
 */
const isAutoNotificationBlocked = (user, notifType = '', autoType = '', mobileConfig = null, userLevel = null) => {
  if (!user) return true;
  if (!isUserActive(user)) return true;

  if (!mobileConfig) return false;

  // 1. If login is blocked for this user, do not send notifications
  if (isUserLoginBlocked(user, mobileConfig, userLevel)) return true;

  const lowerType = String(notifType || '').toLowerCase();
  const lowerAuto = String(autoType || '').toLowerCase();

  // 2. Tracking / Geofence notifications
  if (lowerType.includes('tracing') || lowerType.includes('tracking') || lowerAuto.includes('geofence') || lowerAuto.includes('tracing') || lowerAuto.includes('tracking')) {
    if (isUserTrackingBlocked(user, mobileConfig, userLevel)) return true;
  }

  // 3. Attendance notifications (late arrival, absent, punch out reminder, attendance missing)
  if (lowerType.includes('attendance') || lowerAuto.includes('late') || lowerAuto.includes('absent') || lowerAuto.includes('punch out') || lowerAuto.includes('attendance')) {
    if (isUserAttendanceBlocked(user, mobileConfig, userLevel)) return true;
  }

  // 4. Leave notifications (leave requested, leave approved)
  if (lowerType.includes('leave') || lowerAuto.includes('leave')) {
    if (isUserLeaveBlocked(user, mobileConfig, userLevel)) return true;
  }

  // 5. Customer visit notifications
  if (lowerType.includes('customer visit') || lowerType.includes('visit') || lowerAuto.includes('visit')) {
    if (isUserVisitBlocked(user, mobileConfig, userLevel)) return true;
  }

  // 6. Shift notifications
  if (lowerType.includes('shift') || lowerAuto.includes('shift')) {
    if (isUserShiftBlocked(user, mobileConfig, userLevel)) return true;
  }

  return false;
};

module.exports = {
  isUserActive,
  isUserBlocked,
  isUserScreenBlocked,
  isUserTrackingBlocked,
  isUserLoginBlocked,
  isUserAttendanceBlocked,
  isUserLeaveBlocked,
  isUserVisitBlocked,
  isUserShiftBlocked,
  isAutoNotificationBlocked,
};
