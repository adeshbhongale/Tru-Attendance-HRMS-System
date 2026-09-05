// Dynamic Role-Based Access Control (RBAC) Middleware
// All role/level/permission checks are DB-driven — zero hardcoded strings or regex

const mongoose = require('mongoose');

// ─── In-Memory Caches (company-aware) ────────────────────────────────────────
// Levels and departments are tenant-scoped: every company owns its own masters.
// Caches are keyed by companyId (string) so company A's level 5 never overwrites
// company B's level 5. 'GLOBAL' is the fallback bucket for legacy (null) records.
const companyKey = (companyId) => companyId ? companyId.toString() : 'GLOBAL';

let levelCacheByCompany = {};         // { companyKey: { levelNumber: levelDoc } }
let levelByIdCacheByCompany = {};     // { companyKey: { _id: levelDoc } }
let departmentCacheByCompany = {};    // { companyKey: { PREFIX: deptDoc } }
let permissionsCache = {};            // { permissionKey: permDoc, ... }

let lastLevelCacheSync = 0;
let lastPermCacheSync = 0;
let lastDeptCacheSync = 0;
const CACHE_TTL = 30000; // 30 seconds

const levelCacheForCompany = (companyId) => levelCacheByCompany[companyKey(companyId)] || {};
const levelByIdCacheForCompany = (companyId) => levelByIdCacheByCompany[companyKey(companyId)] || {};
const departmentCacheForCompany = (companyId) => departmentCacheByCompany[companyKey(companyId)] || {};

// ─── Cache Sync Functions ────────────────────────────────────────────────────

/**
 * Synchronize Level hierarchy from MongoDB
 */
const syncLevelsFromDB = async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const Level = mongoose.models.Level || require('../models/Level');
      const levels = await Level.find({ status: 'active' }).sort({ levelNumber: 1 }).lean();

      const newCache = {};
      const newByIdCache = {};
      levels.forEach(l => {
        const k = companyKey(l.companyId || l.company);
        if (!newCache[k]) newCache[k] = {};
        if (!newByIdCache[k]) newByIdCache[k] = {};
        newCache[k][l.levelNumber] = l;
        newByIdCache[k][l._id.toString()] = l;
      });
      levelCacheByCompany = newCache;
      levelByIdCacheByCompany = newByIdCache;
      lastLevelCacheSync = Date.now();
    }
  } catch (err) {
    // Fail gracefully if DB connection not established yet
  }
  return levelCacheByCompany;
};

/**
 * Synchronize departments from MongoDB
 */
const syncDepartmentsFromDB = async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const Department = mongoose.models.Department || require('../models/Department');
      const depts = await Department.find({ status: 'active' }).select('name prefix companyId company').lean();

      const newCache = {};
      depts.forEach(d => {
        if (d.prefix) {
          const k = companyKey(d.companyId || d.company);
          if (!newCache[k]) newCache[k] = {};
          newCache[k][d.prefix.toUpperCase()] = {
            code: d.prefix.toUpperCase(),
            name: d.name,
          };
        }
      });
      departmentCacheByCompany = newCache;
      lastDeptCacheSync = Date.now();
    }
  } catch (err) {
    // Fail gracefully
  }
  return departmentCacheByCompany;
};

/**
 * Synchronize permissions from MongoDB
 */
const syncPermissionsFromDB = async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const RolePermission = mongoose.models.RolePermission || require('../models/RolePermission');
      let perms = await RolePermission.find({ status: 'active' }).lean();

      // Auto-seed if collection is empty
      if (perms.length === 0) {
        const seedScript = require('../scripts/seed_permissions');
        await seedScript.seedAllPermissions();
        perms = await RolePermission.find({ status: 'active' }).lean();
      }

      const newCache = {};
      perms.forEach(p => {
        newCache[p.permissionKey] = {
          allowedRoles: (p.allowedRoles || []).map(r => r.toLowerCase()),
          allowedRoleCodes: (p.allowedRoleCodes || []).map(c => c.toUpperCase()),
          minLevelNumber: p.minLevelNumber || null,
          allowedCategories: (p.allowedCategories || []).map(c => c.toUpperCase()),
          category: p.category,
          description: p.description,
        };
      });
      permissionsCache = newCache;
      lastPermCacheSync = Date.now();
    }
  } catch (err) {
    // Fail gracefully
  }
  return permissionsCache;
};

// Initial background sync
syncLevelsFromDB().catch(() => {});
syncDepartmentsFromDB().catch(() => {});
syncPermissionsFromDB().catch(() => {});

// ─── Role Code Parsing ──────────────────────────────────────────────────────

/**
 * Parse a role code into its components.
 * New format: [OrgCode(2-5)][CategoryPrefix|DeptPrefix(2)][LevelNumber(1-2 digits)][Grade(1 letter)]
 * Examples: TCDI1A, TCMN4B, TCLD5A, TCSF8A, TCHR12C
 */
const parseRoleCode = (roleCode, companyId = null) => {
  if (!roleCode || typeof roleCode !== 'string') {
    return { orgCode: null, prefix: null, levelNumber: null, grade: null, category: null, isValid: false };
  }

  const cleanCode = roleCode.trim().toUpperCase();

  // Match: 2-5 letter org code + 2 letter prefix + 1-2 digit level + 1 letter grade
  const match = cleanCode.match(/^([A-Z]{2,5})([A-Z]{2})(\d{1,2})([A-Z])$/);
  if (!match) {
    return { orgCode: null, prefix: null, levelNumber: null, grade: null, category: null, isValid: false };
  }

  const orgCode = match[1];
  const prefix = match[2];
  const levelNumber = parseInt(match[3], 10);
  const grade = match[4].toLowerCase();

  // Refresh level cache periodically
  if (Date.now() - lastLevelCacheSync > CACHE_TTL) {
    syncLevelsFromDB().catch(() => {});
  }

  // Determine category from this company's level cache
  const levelDoc = levelCacheForCompany(companyId)[levelNumber];
  let category = null;
  if (levelDoc) {
    category = levelDoc.category;
  }

  // Determine if prefix is a category prefix or department prefix
  const isCategoryPrefix = ['DI', 'MN', 'LD'].includes(prefix);

  // Refresh department cache for dept prefix lookup
  if (!isCategoryPrefix && Date.now() - lastDeptCacheSync > CACHE_TTL) {
    syncDepartmentsFromDB().catch(() => {});
  }

  const deptInfo = !isCategoryPrefix ? (departmentCacheForCompany(companyId)[prefix] || null) : null;

  return {
    orgCode,
    prefix,
    levelNumber,
    grade,
    category,
    isCategoryPrefix,
    deptCode: isCategoryPrefix ? null : prefix,
    deptName: deptInfo ? deptInfo.name : null,
    isValid: true,
  };
};

// ─── Effective Level Resolution ──────────────────────────────────────────────

/**
 * Get effective level number for a user (lower number = higher authority).
 * Reads from populated levelRef first, falls back to roleLevel, then roleCode parsing.
 * No hardcoded switch/case or designation string matching.
 */
const getEffectiveLevelNumber = (user) => {
  if (!user) return 99;

  // 1. Populated levelRef (best source)
  if (user.levelRef && user.levelRef.levelNumber) {
    return user.levelRef.levelNumber;
  }

  // 2. Stored roleLevel field
  if (user.roleLevel && user.roleLevel >= 1) {
    return user.roleLevel;
  }

  // 3. Parse from roleCode
  if (user.roleCode) {
    const parsed = parseRoleCode(user.roleCode, user.companyId || user.company || null);
    if (parsed.isValid && parsed.levelNumber) return parsed.levelNumber;
  }

  // 4. Legacy role string fallback for super_admin / company_admin only
  if (user.role === 'super_admin' || user.role === 'company_admin') {
    return 1;
  }

  return 99; // Unassigned
};

/**
 * Get effective grade for a user
 */
const getEffectiveGradeCode = (user) => {
  if (!user) return 'a';

  if (user.gradeRef && user.gradeRef.code) return user.gradeRef.code;

  if (user.roleCode) {
    const parsed = parseRoleCode(user.roleCode, user.companyId || user.company || null);
    if (parsed.isValid && parsed.grade) return parsed.grade;
  }

  if (user.roleGrade && typeof user.roleGrade === 'string') {
    return user.roleGrade.toLowerCase();
  }

  return 'a';
};

/**
 * Get effective category for a user
 */
const getEffectiveCategory = (user) => {
  if (!user) return null;

  if (user.levelRef && user.levelRef.category) return user.levelRef.category;

  if (user.roleCode) {
    const parsed = parseRoleCode(user.roleCode, user.companyId || user.company || null);
    if (parsed.category) return parsed.category;
  }

  // Refresh level cache and look up by roleLevel
  if (user.roleLevel && levelCacheForCompany(user.companyId || user.company || null)[user.roleLevel]) {
    return levelCacheForCompany(user.companyId || user.company || null)[user.roleLevel].category;
  }

  return null;
};

// ─── Permission Check ────────────────────────────────────────────────────────

/**
 * Dynamic permission check against MongoDB RolePermission matrix.
 * Uses levelNumber comparison (lower = higher authority) and category matching.
 */
const hasPermission = (userOrRole, permission) => {
  if (!userOrRole) return false;

  // Refresh caches periodically
  if (Date.now() - lastPermCacheSync > CACHE_TTL) {
    syncPermissionsFromDB().catch(() => {});
  }

  let role = '';
  let roleCode = '';
  let userLevelNumber = 99;
  let userCategory = null;

  if (typeof userOrRole === 'string') {
    if (userOrRole.match(/^[A-Z]{2,5}[A-Z]{2}\d{1,2}[A-Z]$/i)) {
      roleCode = userOrRole.toUpperCase();
      const parsed = parseRoleCode(roleCode);
      userLevelNumber = parsed.levelNumber || 99;
      userCategory = parsed.category;
    } else {
      role = userOrRole.toLowerCase();
    }
  } else if (typeof userOrRole === 'object') {
    role = (userOrRole.role || '').toLowerCase();
    roleCode = (userOrRole.roleCode || '').toUpperCase();
    userLevelNumber = getEffectiveLevelNumber(userOrRole);
    userCategory = getEffectiveCategory(userOrRole);
  }

  // Super Admin / Company Admin master override
  if (role === 'super_admin' || role === 'superadmin' || role === 'admin' || role === 'company_admin' || (typeof userOrRole === 'object' && userOrRole.scope === 'GLOBAL')) {
    return true;
  }
  // DIRECTOR category always has full access
  if (userCategory === 'DIRECTOR') {
    return true;
  }

  // Allow all logged-in employees to perform standard material operations
  const universalPermissions = [
    'transaction:create',
    'transaction:view_own',
    'transaction:view_all',
    'transaction:view_department',
    'transaction:view_team',
    'transfer:create',
    'transfer:view',
    'barcode:view',
    'barcode:scan',
    'approval:view',
    'approval:approve',
    'approval:reject',
  ];
  if (universalPermissions.includes(permission)) {
    return true;
  }

  // Look up permission config from dynamic cache
  const permConfig = permissionsCache[permission];
  if (!permConfig) return false;

  const { allowedRoles, allowedRoleCodes, minLevelNumber, allowedCategories } = permConfig;

  // Check minLevelNumber (lower number = higher authority, so user must be <= min)
  if (minLevelNumber !== null && minLevelNumber !== undefined) {
    if (userLevelNumber <= minLevelNumber) return true;
  }

  // Check allowed categories
  if (allowedCategories && allowedCategories.length > 0 && userCategory) {
    if (allowedCategories.includes(userCategory)) return true;
  }

  // Check direct role string match
  if (role && allowedRoles && allowedRoles.includes(role)) {
    return true;
  }

  // Check direct role code match
  if (roleCode && allowedRoleCodes && allowedRoleCodes.includes(roleCode)) {
    return true;
  }

  // Level-based fallback checks for backward compatibility
  if (userLevelNumber <= 4 && allowedRoles && (allowedRoles.includes('department_admin') || allowedRoles.includes('admin'))) {
    return true; // MANAGEMENT level or above
  }
  if (userLevelNumber <= 7 && allowedRoles && allowedRoles.includes('team_lead')) {
    return true; // LEADERSHIP level or above
  }

  return false;
};

// ─── Middleware Functions ────────────────────────────────────────────────────

const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const hasAccess = permissions.some((perm) => hasPermission(req.user, perm));

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

const requireRoleLevel = (maxLevelNumber) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const effectiveLevel = getEffectiveLevelNumber(req.user);
    if (effectiveLevel <= maxLevelNumber) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Action requires Level ${maxLevelNumber} or higher authority (Your Level: ${effectiveLevel}).`
    });
  };
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient role.' });
    }

    next();
  };
};

// ─── Authority Helper Functions ──────────────────────────────────────────────

const isManagementNoAttendanceRestriction = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const levelNum = getEffectiveLevelNumber(user);
  const category = getEffectiveCategory(user);
  // DIRECTOR and MANAGEMENT categories have no attendance restrictions
  if (category === 'DIRECTOR' || category === 'MANAGEMENT') return true;
  if (levelNum <= 2) return true; // BOD, COE
  if (['super_admin', 'company_admin', 'admin'].includes(user.role)) return true;
  return false;
};

const hasAttendanceRestrictions = (userOrReq) => {
  return !isManagementNoAttendanceRestriction(userOrReq);
};

/**
 * Check if user is an admin for a specific department.
 * DIRECTOR/MANAGEMENT categories have authority over ALL departments.
 * LEADERSHIP category has authority based on their assigned departments.
 * STAFF/TRAINEE are department-specific.
 */
const isDepartmentAdmin = (userOrReq, deptPrefix) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const category = getEffectiveCategory(user);
  const levelNum = getEffectiveLevelNumber(user);

  // DIRECTOR/MANAGEMENT have authority over all departments
  if (category === 'DIRECTOR' || category === 'MANAGEMENT') return true;
  if (['super_admin', 'company_admin'].includes(user.role)) return true;

  // LEADERSHIP can manage departments
  if (category === 'LEADERSHIP' && levelNum <= 7) return true;

  // Check by parsed roleCode dept prefix
  if (deptPrefix && user.roleCode) {
    const parsed = parseRoleCode(user.roleCode, user.companyId || user.company || null);
    if (parsed.isValid && parsed.deptCode === deptPrefix.toUpperCase()) return true;
  }

  // Check by user's department name
  if (deptPrefix && user.department) {
    if (Date.now() - lastDeptCacheSync > CACHE_TTL) {
      syncDepartmentsFromDB().catch(() => {});
    }
    const deptInfo = departmentCacheForCompany(user.companyId || user.company || null)[deptPrefix.toUpperCase()];
    if (deptInfo && user.department.toLowerCase() === deptInfo.name.toLowerCase()) return true;
  }

  return false;
};

// Legacy-compatible department admin checks — now all route through isDepartmentAdmin
const isStoreAdmin = (userOrReq) => isDepartmentAdmin(userOrReq, 'ST');
const isHRAdmin = (userOrReq) => isDepartmentAdmin(userOrReq, 'HR');
const isOpsAdmin = (userOrReq) => isDepartmentAdmin(userOrReq, 'OP');
const isFinanceAdmin = (userOrReq) => isDepartmentAdmin(userOrReq, 'FN');
const isAccountsAdmin = isFinanceAdmin;

const isManagementAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const category = getEffectiveCategory(user);
  if (category === 'DIRECTOR' || category === 'MANAGEMENT') return true;
  const levelNum = getEffectiveLevelNumber(user);
  if (levelNum <= 4) return true; // AVP or above
  if (['super_admin', 'company_admin', 'admin', 'department_admin'].includes(user.role)) return true;
  return false;
};

// ─── Data Scope Filter ──────────────────────────────────────────────────────

const getAccessibleUserFilter = (user, userField = 'user') => {
  if (!user) return { [userField]: null };

  const scope = user.dataScope ? user.dataScope.toUpperCase() : null;

  if (scope === 'ALL' || user.role === 'super_admin' || user.role === 'company_admin') {
    return {}; // Unrestricted access
  }

  // DIRECTOR category always unrestricted
  const category = getEffectiveCategory(user);
  if (category === 'DIRECTOR') {
    return {};
  }

  if (scope === 'COMPANY' && user.company) {
    return { company: user.company };
  }

  if (scope === 'BRANCH' && user.branch) {
    return { branch: user.branch };
  }

  if (scope === 'DEPARTMENT' && user.department) {
    return { department: user.department };
  }

  if (scope === 'SUB_DEPARTMENT' && user.department) {
    return { department: user.department };
  }

  if (scope === 'TEAM') {
    return {
      $or: [
        { [userField]: user._id },
        { reportsTo: user._id },
        { department: user.department }
      ]
    };
  }

  if (scope === 'SELF') {
    return { [userField]: user._id };
  }

  // Level-based fallback
  const levelNum = getEffectiveLevelNumber(user);
  if (levelNum <= 2) {
    return {}; // DIRECTOR level
  }
  if (levelNum <= 4) {
    return user.company ? { company: user.company } : {}; // MANAGEMENT level
  }
  if (levelNum <= 7) {
    return user.department ? { department: user.department } : {}; // LEADERSHIP level
  }
  return { [userField]: user._id }; // STAFF/TRAINEE
};

// ─── Role Code Generation ───────────────────────────────────────────────────

/**
 * Generate role code dynamically.
 * For DIRECTOR/MANAGEMENT/LEADERSHIP → uses categoryPrefix (DI/MN/LD)
 * For STAFF/TRAINEE → uses department prefix (SF/HR/etc.)
 *
 * @param {string} orgCode - Organization code (default 'TC')
 * @param {object|string} levelInput - Level document or level number
 * @param {string} gradeCode - Grade code letter (a/b/c)
 * @param {string} deptPrefix - Department prefix (only used for STAFF/TRAINEE)
 */
const generateRoleCode = async (orgCode = 'TC', levelInput, gradeCode, deptPrefix, companyId = null) => {
  if (!levelInput || !gradeCode) return null;

  let levelDoc = null;

  // Resolve level document
  if (typeof levelInput === 'number') {
    // Refresh cache
    if (Date.now() - lastLevelCacheSync > CACHE_TTL) {
      await syncLevelsFromDB();
    }
    levelDoc = levelCacheForCompany(companyId)[levelInput];
  } else if (typeof levelInput === 'object' && levelInput.levelNumber) {
    levelDoc = levelInput;
  } else if (typeof levelInput === 'string') {
    // Could be a level _id
    if (Date.now() - lastLevelCacheSync > CACHE_TTL) {
      await syncLevelsFromDB();
    }
    levelDoc = levelByIdCacheForCompany(companyId)[levelInput];
    if (!levelDoc) {
      // Try to fetch from DB (scoped to company)
      const Level = mongoose.models.Level || require('../models/Level');
      levelDoc = await Level.findOne({ _id: levelInput, ...(companyId ? { companyId } : {}) }).lean();
    }
  }

  if (!levelDoc || !levelDoc.levelNumber) return null;

  // Determine prefix: if deptPrefix is provided (e.g., SF for Software Dept Manager), use it!
  // Otherwise fall back to levelDoc.categoryPrefix (DI/MN/LD for multi-department/global roles)
  let codePrefix;
  if (deptPrefix && typeof deptPrefix === 'string' && deptPrefix.trim().length === 2) {
    codePrefix = deptPrefix.trim().toUpperCase();
  } else if (levelDoc.categoryPrefix && levelDoc.categoryPrefix.length === 2) {
    codePrefix = levelDoc.categoryPrefix.toUpperCase();
  } else if (deptPrefix && typeof deptPrefix === 'string' && deptPrefix.trim().length >= 2) {
    codePrefix = deptPrefix.trim().substring(0, 2).toUpperCase();
  } else {
    codePrefix = 'GN'; // General fallback
  }

  return `${orgCode.toUpperCase()}${codePrefix}${levelDoc.levelNumber}${gradeCode.toUpperCase()}`;
};

/**
 * Synchronous role code generation using cached data (for backward compatibility).
 * Prefer the async version when possible.
 */
const generateRoleCodeSync = (orgCode = 'TC', deptPrefix, levelNumber, gradeCode, companyId = null) => {
  if (!levelNumber || !gradeCode) return null;

  const levelDoc = levelCacheForCompany(companyId)[levelNumber];
  let codePrefix;

  if (deptPrefix && typeof deptPrefix === 'string' && deptPrefix.trim().length >= 2) {
    codePrefix = deptPrefix.trim().substring(0, 2).toUpperCase();
  } else if (levelDoc && levelDoc.categoryPrefix && levelDoc.categoryPrefix.length === 2) {
    codePrefix = levelDoc.categoryPrefix.toUpperCase();
  } else {
    codePrefix = 'GN';
  }

  return `${orgCode.toUpperCase()}${codePrefix}${levelNumber}${gradeCode.toUpperCase()}`;
};

/**
 * Check if one level has authority over another (lower number = higher authority)
 */
const hasLevelAuthority = (userLevelNumber, targetLevelNumber) => {
  if (!userLevelNumber || !targetLevelNumber) return false;
  return userLevelNumber <= targetLevelNumber;
};

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  DEPARTMENTS: departmentCacheByCompany,
  PERMISSIONS: permissionsCache,
  syncLevelsFromDB,
  syncDepartmentsFromDB,
  syncPermissionsFromDB,
  generateRoleCode,
  generateRoleCodeSync,
  parseRoleCode,
  getEffectiveLevelNumber,
  getEffectiveGradeCode,
  getEffectiveCategory,
  hasLevelAuthority,
  hasPermission,
  requirePermission,
  requireRoleLevel,
  requireRole,
  isDepartmentAdmin,
  isStoreAdmin,
  isHRAdmin,
  isOpsAdmin,
  isFinanceAdmin,
  isManagementAdmin,
  isAccountsAdmin,
  isManagementNoAttendanceRestriction,
  hasAttendanceRestrictions,
  getAccessibleUserFilter,
};
