// TruCode Enterprise ERP — Dynamic Department & Designation Master RBAC Hierarchy
// Naming Convention: TC + [Dept Code (2 Letters)] + [Level (1-5)] + [Promotion Grade (a, b, c)]

const mongoose = require('mongoose');

// Dynamic in-memory caches synchronized from MongoDB
let dynamicDepartmentCache = {};
let dynamicPermissionsCache = {};

let lastDeptCacheSync = 0;
let lastPermCacheSync = 0;
const CACHE_TTL = 30000; // 30 seconds cache TTL

/**
 * Synchronize department dictionary dynamically from Department Master in MongoDB
 */
const syncDepartmentsFromDB = async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const Department = mongoose.models.Department || require('../models/Department');
      const depts = await Department.find({ status: 'active' }).select('name prefix roleLevels roleGrades').lean();
      
      const newCache = {};
      depts.forEach(d => {
        if (d.prefix) {
          const upperPrefix = d.prefix.toUpperCase();
          newCache[upperPrefix] = {
            code: upperPrefix,
            name: d.name,
            roleLevels: d.roleLevels,
            roleGrades: d.roleGrades
          };
        }
      });
      dynamicDepartmentCache = newCache;
      lastDeptCacheSync = Date.now();
    }
  } catch (err) {
    // Fail gracefully if DB connection not established yet
  }
  return dynamicDepartmentCache;
};

/**
 * Synchronize permissions dynamically from RolePermission model in MongoDB
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
          category: p.category,
          description: p.description,
        };
      });
      dynamicPermissionsCache = newCache;
      lastPermCacheSync = Date.now();
    }
  } catch (err) {
    // Fail gracefully if DB connection not established yet
  }
  return dynamicPermissionsCache;
};

// Initial background sync
syncDepartmentsFromDB().catch(() => {});
syncPermissionsFromDB().catch(() => {});

const parseRoleCode = (roleCode) => {
  if (!roleCode || typeof roleCode !== 'string') {
    return { isMaster: false, isSuperAdmin: false, isCompanyAdmin: false, isAuditor: false, level: 5, grade: 'a', deptCode: null, deptName: null };
  }

  const cleanCode = roleCode.trim().toUpperCase();

  // Organization-Wide Master Roles
  if (cleanCode === 'TCSA1' || cleanCode === 'SUPER_ADMIN') {
    return { isMaster: true, isSuperAdmin: true, isCompanyAdmin: true, isAuditor: false, level: 1, grade: 'c', deptCode: 'ALL', deptName: 'All Departments' };
  }
  if (cleanCode === 'TCCA1' || cleanCode === 'COMPANY_ADMIN') {
    return { isMaster: true, isSuperAdmin: false, isCompanyAdmin: true, isAuditor: false, level: 1, grade: 'c', deptCode: 'ALL', deptName: 'All Departments' };
  }
  if (cleanCode === 'TCGA1' || cleanCode === 'AUDITOR' || cleanCode === 'GUEST') {
    return { isMaster: true, isSuperAdmin: false, isCompanyAdmin: false, isAuditor: true, level: 1, grade: 'a', deptCode: 'ALL', deptName: 'All Departments' };
  }

  // Format: TC + [Dept Code (2 Letters)] + [Level (1-5)] + [Grade (a, b, c)]
  const match = cleanCode.match(/^TC([A-Z]{2})([1-5])([ABC])$/i);
  if (match) {
    const deptCode = match[1].toUpperCase();
    const level = parseInt(match[2], 10);
    const grade = match[3].toLowerCase();

    // Refresh dynamic department cache periodically
    if (Date.now() - lastDeptCacheSync > CACHE_TTL) {
      syncDepartmentsFromDB().catch(() => {});
    }

    const deptInfo = dynamicDepartmentCache[deptCode] || { code: deptCode, name: deptCode };

    return {
      isMaster: false,
      isSuperAdmin: false,
      isCompanyAdmin: false,
      isAuditor: false,
      level,
      grade,
      deptCode,
      deptName: deptInfo.name,
      roleLevels: deptInfo.roleLevels,
      roleGrades: deptInfo.roleGrades,
      formattedCode: `TC${deptCode}${level}${grade}`
    };
  }

  return { isMaster: false, isSuperAdmin: false, isCompanyAdmin: false, isAuditor: false, level: 5, grade: 'a', deptCode: null, deptName: null };
};

/**
 * Determine dynamic effective role level for a user (from roleCode, roleLevel, or Designation Master title)
 */
const getEffectiveRoleLevel = (user) => {
  if (!user) return 5;
  if (user.roleCode) {
    const parsed = parseRoleCode(user.roleCode);
    if (parsed.level) return parsed.level;
  }
  if (user.roleLevel && user.roleLevel >= 1 && user.roleLevel <= 5) {
    return user.roleLevel;
  }

  // Dynamic Level Inference based on Designation Master Name
  if (user.designation && typeof user.designation === 'string') {
    const desigLower = user.designation.toLowerCase();
    if (desigLower.includes('manager') || desigLower.includes('head') || desigLower.includes('director') || desigLower.includes('chief') || desigLower.includes('vp')) {
      return 1;
    }
    if (desigLower.includes('lead') || desigLower.includes('assistant manager') || desigLower.includes('supervisor')) {
      return 2;
    }
    if (desigLower.includes('senior') || desigLower.includes('sr.') || desigLower.includes('principal') || desigLower.includes('specialist')) {
      return 3;
    }
    if (desigLower.includes('junior') || desigLower.includes('jr.') || desigLower.includes('executive') || desigLower.includes('engineer') || desigLower.includes('officer')) {
      return 4;
    }
    if (desigLower.includes('trainee') || desigLower.includes('intern') || desigLower.includes('associate') || desigLower.includes('helper')) {
      return 5;
    }
  }

  switch (user.role) {
    case 'super_admin': return 1;
    case 'company_admin': return 1;
    case 'admin': return 1;
    case 'department_admin': return 1;
    case 'team_lead': return 2;
    default: return 4;
  }
};

const getEffectiveRoleGrade = (user) => {
  if (!user) return 'a';
  if (user.roleCode) {
    const parsed = parseRoleCode(user.roleCode);
    if (parsed.grade) return parsed.grade;
  }
  if (user.roleGrade && ['a', 'b', 'c'].includes(user.roleGrade.toLowerCase())) {
    return user.roleGrade.toLowerCase();
  }
  return 'a';
};

/**
 * Dynamic Permission Check against MongoDB RolePermission matrix
 */
const hasPermission = (userOrRole, permission) => {
  if (!userOrRole) return false;

  // Refresh dynamic permission cache periodically
  if (Date.now() - lastPermCacheSync > CACHE_TTL) {
    syncPermissionsFromDB().catch(() => {});
  }

  let role = '';
  let roleCode = '';
  let userLevel = 5;

  if (typeof userOrRole === 'string') {
    if (userOrRole.toUpperCase().startsWith('TC')) {
      roleCode = userOrRole.toUpperCase();
    } else {
      role = userOrRole.toLowerCase();
    }
  } else if (typeof userOrRole === 'object') {
    role = (userOrRole.role || '').toLowerCase();
    roleCode = (userOrRole.roleCode || '').toUpperCase();
    userLevel = getEffectiveRoleLevel(userOrRole);
  }

  // Super Admin / Company Admin master override
  if (role === 'super_admin' || role === 'admin' || role === 'company_admin' || roleCode === 'TCSA1' || roleCode === 'TCCA1') {
    return true;
  }

  // Allow all logged-in employees to perform standard material operations
  if ([
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
    'approval:reject'
  ].includes(permission)) {
    return true;
  }

  // Check direct role string match
  if (role && allowedRoles.includes(role)) {
    return true;
  }

  // Check direct role code match
  if (roleCode && (allowedRoleCodes.includes(roleCode) || allowedRoles.includes(roleCode.toLowerCase()))) {
    return true;
  }

  // Check Department-Specific Role Matching (dept:store_admin, dept:software_admin, etc.)
  if (typeof userOrRole === 'object') {
    const rawDept = (userOrRole.department || '').trim().toLowerCase();
    const cleanDeptKey = rawDept.replace(/\s+/g, '_');
    const parsed = userOrRole.roleCode ? parseRoleCode(userOrRole.roleCode) : {};
    const deptCode = (parsed.deptCode || '').toUpperCase();

    if (userLevel === 1) {
      // 1) Direct dynamic role key match (e.g. dept:software_admin, dept:store_admin)
      const dynamicKey = `dept:${cleanDeptKey}_admin`;
      if (allowedRoles.includes(dynamicKey)) return true;

      // 2) Direct dynamic role code match (e.g. TCSF1, TCST1, TCHR1)
      if (deptCode && (allowedRoleCodes.includes(`TC${deptCode}1`) || allowedRoles.includes(`TC${deptCode}1`))) return true;

      // 3) Department keyword & alias matching
      const isStore = deptCode === 'ST' || rawDept.includes('store');
      const isHR = deptCode === 'HR' || rawDept.includes('hr') || rawDept.includes('human');
      const isOps = deptCode === 'OP' || rawDept.includes('operation') || rawDept.includes('site');
      const isSoftware = deptCode === 'SF' || deptCode === 'SW' || deptCode === 'IT' || rawDept.includes('software') || rawDept.includes('tech') || rawDept.includes('it');
      const isFinance = deptCode === 'FN' || rawDept.includes('fin') || rawDept.includes('account');

      if (isStore && (allowedRoles.includes('dept:store_admin') || allowedRoleCodes.includes('TCST1'))) return true;
      if (isHR && (allowedRoles.includes('dept:hr_admin') || allowedRoleCodes.includes('TCHR1'))) return true;
      if (isOps && (allowedRoles.includes('dept:ops_admin') || allowedRoleCodes.includes('TCOP1'))) return true;
      if (isSoftware && (allowedRoles.includes('dept:software_admin') || allowedRoles.includes('dept:it_admin') || allowedRoleCodes.includes('TCSF1') || allowedRoleCodes.includes('TCIT1'))) return true;
      if (isFinance && (allowedRoles.includes('dept:finance_admin') || allowedRoleCodes.includes('TCFN1'))) return true;
    }
  }

  // Check generic Level 1 (Department Admin / Manager) override if explicitly allowed for all dept admins
  if (userLevel === 1 && (allowedRoles.includes('department_admin') || allowedRoles.includes('admin'))) {
    return true;
  }

  // Check Level 2 (Team Lead) override
  if (userLevel <= 2 && allowedRoles.includes('team_lead')) {
    return true;
  }

  return false;
};

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

const requireRoleLevel = (maxLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const effectiveLevel = getEffectiveRoleLevel(req.user);
    if (effectiveLevel <= maxLevel) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Action requires Level ${maxLevel} or higher authority (Your Level: ${effectiveLevel}).`
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

const isManagementNoAttendanceRestriction = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const level = getEffectiveRoleLevel(user);
  if (level <= 1) return true; // Level 1 Management has NO attendance restrictions
  if (['super_admin', 'company_admin', 'admin'].includes(user.role)) return true;
  return false;
};

const hasAttendanceRestrictions = (userOrReq) => {
  return !isManagementNoAttendanceRestriction(userOrReq);
};

const isStoreAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const parsed = parseRoleCode(user.roleCode);
  if (parsed.isSuperAdmin || parsed.isCompanyAdmin) return true;
  const dept = (user.department || '').toLowerCase();
  return parsed.deptCode === 'ST' || dept.includes('store');
};

const isHRAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const parsed = parseRoleCode(user.roleCode);
  if (parsed.isSuperAdmin || parsed.isCompanyAdmin) return true;
  const dept = (user.department || '').toLowerCase();
  return parsed.deptCode === 'HR' || dept.includes('hr') || dept.includes('human');
};

const isOpsAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const parsed = parseRoleCode(user.roleCode);
  if (parsed.isSuperAdmin || parsed.isCompanyAdmin) return true;
  const dept = (user.department || '').toLowerCase();
  return parsed.deptCode === 'OP' || dept.includes('operation') || dept.includes('site');
};

const isFinanceAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const parsed = parseRoleCode(user.roleCode);
  if (parsed.isSuperAdmin || parsed.isCompanyAdmin) return true;
  const dept = (user.department || '').toLowerCase();
  return parsed.deptCode === 'FN' || dept.includes('fin') || dept.includes('account');
};

const isManagementAdmin = (userOrReq) => {
  const user = userOrReq?.user || userOrReq;
  if (!user) return false;
  const level = getEffectiveRoleLevel(user);
  return level <= 1 || ['super_admin', 'company_admin', 'admin', 'department_admin'].includes(user.role);
};

const isAccountsAdmin = isFinanceAdmin;

const getAccessibleUserFilter = (user, userField = 'user') => {
  if (!user) return { [userField]: null };

  const scope = user.dataScope ? user.dataScope.toUpperCase() : null;

  if (scope === 'ALL' || user.role === 'super_admin' || user.role === 'company_admin') {
    return {}; // Unrestricted access
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

  // Legacy Level-based fallback
  const level = getEffectiveRoleLevel(user);
  if (level === 1) {
    return {};
  }
  if (level === 2 || level === 3) {
    return user.department ? { department: user.department } : {};
  }
  return { [userField]: user._id };
};

const GLOBAL_ROLES = {
  SUPER_ADMIN: { suffix: 'SA1', role: 'super_admin', name: 'Super Admin', code: 'TCSA1' },
  COMPANY_ADMIN: { suffix: 'CA1', role: 'company_admin', name: 'Company Admin', code: 'TCCA1' },
  AUDITOR: { suffix: 'GA1', role: 'auditor', name: 'Auditor / Guest', code: 'TCGA1' },
};

/**
 * Generate role code dynamically resolving prefix exclusively from Department Master
 */
const generateRoleCode = (orgCode = 'TC', deptInput, level, grade) => {
  if (!deptInput || !level || !grade) {
    return null;
  }

  let deptPrefix = '';
  if (typeof deptInput === 'string') {
    if (deptInput.length === 2 && /^[A-Za-z]{2}$/.test(deptInput)) {
      deptPrefix = deptInput.toUpperCase();
    } else {
      const foundDept = Object.values(dynamicDepartmentCache).find(
        d => (d.name && d.name.toLowerCase() === deptInput.toLowerCase()) || (d.code && d.code.toLowerCase() === deptInput.toLowerCase())
      );
      deptPrefix = foundDept ? foundDept.code : deptInput.substring(0, 2).toUpperCase();
    }
  } else if (deptInput && deptInput.prefix) {
    deptPrefix = deptInput.prefix.toUpperCase();
  }

  if (!deptPrefix || deptPrefix.length !== 2) {
    return null;
  }

  return `${orgCode.toUpperCase()}${deptPrefix}${level}${grade.toLowerCase()}`;
};

const generateGlobalRoleCode = (orgCode = 'TC', globalRoleKey) => {
  const globalRole = GLOBAL_ROLES[globalRoleKey];
  if (!globalRole) return null;
  return `${orgCode.toUpperCase()}${globalRole.suffix}`;
};

const hasLevelAuthority = (userLevel, targetLevel) => {
  if (!userLevel || !targetLevel) return false;
  return userLevel <= targetLevel;
};

module.exports = {
  DEPARTMENTS: dynamicDepartmentCache,
  PERMISSIONS: dynamicPermissionsCache,
  GLOBAL_ROLES,
  syncDepartmentsFromDB,
  syncPermissionsFromDB,
  generateRoleCode,
  generateGlobalRoleCode,
  parseRoleCode,
  getEffectiveRoleLevel,
  getEffectiveRoleGrade,
  hasLevelAuthority,
  hasPermission,
  requirePermission,
  requireRoleLevel,
  requireRole,
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
