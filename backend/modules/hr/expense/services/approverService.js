const mongoose = require('mongoose');
const User = require('../../../../models/User');
const { ACTIVE_USER_EXCLUDED } = require('./claimRules');

/**
 * Approver lookup for the in-app expense approval stage.
 * FULL_PAYMENT  -> Management users (Directors, VPs, AVPs, GMs, Management Dept/Category)
 * OTHER_EXPENSE -> Reporting Managers (Direct managers via reportsTo/approver, Team Leads, Managers)
 */

const SELECT = 'name employeeIdCode department designation role roleCode departmentAdminType adminType levelRef isTeamLead';

const companyCond = (companyId) => {
  if (!companyId || companyId === 'ALL') return {};
  const ids = [String(companyId)];
  if (mongoose.Types.ObjectId.isValid(String(companyId))) {
    ids.push(new mongoose.Types.ObjectId(String(companyId)));
  }
  return {
    $or: [
      { companyId: { $in: ids } },
      { company: { $in: ids } },
    ],
  };
};

async function getManagementLevelIds(companyId) {
  try {
    const Level = mongoose.models.Level || require('../../../../models/Level');
    const levels = await Level.find({
      ...companyCond(companyId),
      $or: [
        { category: 'MANAGEMENT' },
        { name: /(^|\b)ceo(\b|$)/i },
        { code: /(^|\b)ceo(\b|$)/i },
      ],
      name: { $not: /(^|\b)bod(\b|$)/i },
    }).select('_id').lean();
    return levels.map((l) => l._id);
  } catch (_) {
    return [];
  }
}

async function getLeadershipLevelIds(companyId) {
  try {
    const Level = mongoose.models.Level || require('../../../../models/Level');
    const levels = await Level.find({
      ...companyCond(companyId),
      category: 'LEADERSHIP',
    }).select('_id').lean();
    return levels.map((l) => l._id);
  } catch (_) {
    return [];
  }
}

async function reportingManagerIds(companyId) {
  const cCond = companyCond(companyId);
  const [reportsToIds, approverIds] = await Promise.all([
    User.distinct('reportsTo', { ...cCond, reportsTo: { $ne: null } }),
    User.distinct('approver', { ...cCond, approver: { $ne: null } }),
  ]);
  return [...new Set([...reportsToIds, ...approverIds])].filter(Boolean);
}

const EXCLUDED_APPROVER_ROLES = [
  'company_admin',
  'companyadmin',
  'super_admin',
  'superadmin',
  'hr_admin',
  'hradmin',
  'account_admin',
  'accounts_admin',
  'store_admin',
  'storeadmin',
];

const EXCLUDED_APPROVER_ROLE_CODES = [
  'TCCA1',
  'COMPANY_ADMIN',
  'COMPANYADMIN',
  'TCSA1',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'APEXCA1',
  'TCHR1',
  'HR_ADMIN',
  'HRADMIN',
  'TCSF2A',
  'TCSFA',
  'TCACC1',
  'TCACC2',
  'ACCOUNT_ADMIN',
  'ACCOUNTS_ADMIN',
  'TCSTR1',
  'TCSTR2',
  'STORE_ADMIN',
  'STOREADMIN',
];

const EXCLUDED_DEPT_ADMIN_TYPES = [
  'hr',
  'accounts',
  'account',
  'finance',
  'store',
  'warehouse',
  'company',
  'super',
];

const APPROVER_EXCLUSIONS = {
  role: { $nin: EXCLUDED_APPROVER_ROLES },
  roleCode: { $nin: EXCLUDED_APPROVER_ROLE_CODES },
  departmentAdminType: { $nin: EXCLUDED_DEPT_ADMIN_TYPES },
  adminType: { $nin: EXCLUDED_DEPT_ADMIN_TYPES },
  designation: {
    $not: /(company\s*admin|company\s*administrator|super\s*admin|super\s*administrator|hr\s*admin|accounts?\s*admin|finance\s*admin|store\s*admin|warehouse\s*admin)/i,
  },
};

/** CEO user detection (Always allowed in both approval selections) */
function isCeoUser(u) {
  if (!u) return false;
  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const desig = String(u.designation || '').trim().toLowerCase();
  const dept = String(u.department || '').trim().toLowerCase();
  const levelName = String(u.levelRef?.name || u.levelName || '').trim().toUpperCase();
  const levelCode = String(u.levelRef?.code || '').trim().toUpperCase();

  if (role === 'ceo' || roleCode === 'CEO' || /^CEO\b/i.test(roleCode)) return true;
  if (/(^|\b)ceo(\b|$)|chief\s*executive\s*officer/i.test(desig)) return true;
  if (levelName === 'CEO' || /(^|\b)CEO(\b|$)/.test(levelName)) return true;
  if (levelCode === 'CEO' || /(^|\b)CEO(\b|$)/.test(levelCode)) return true;
  if (/(^|\b)ceo(\b|$)/i.test(dept)) return true;
  return false;
}

/** Director role detection (Must NOT be shown in either approval selection) */
function isDirectorRoleUser(u) {
  if (!u) return false;
  if (isCeoUser(u)) return false; // CEO is explicitly allowed, never excluded as director

  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const desig = String(u.designation || '').trim().toLowerCase();
  const dept = String(u.department || '').trim().toLowerCase();
  const levelName = String(u.levelRef?.name || u.levelName || '').trim().toUpperCase();
  const cat = String(u.levelRef?.category || u.effectiveCategory || '').trim().toUpperCase();

  if (levelName === 'BOD' || /(^|\b)(bod|director|directors)(\b|$)/i.test(levelName)) return true;
  if (cat === 'DIRECTOR') return true;
  if (role === 'director' || roleCode === 'DIRECTOR' || /^TC(DR|DI)/i.test(roleCode)) return true;
  if (/^(director|directors|board of directors|bod)$/i.test(dept)) return true;
  if (/(director|board of directors|bod)/i.test(desig)) return true;
  return false;
}

/** Strict in-memory filter to guarantee company admin, hr admin, account admin, store admin, and directors never show */
function isExcludedAdmin(u) {
  if (!u) return true;
  // CEO is explicitly allowed
  if (isCeoUser(u)) return false;
  // Director role is excluded in both approval selections
  if (isDirectorRoleUser(u)) return true;

  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const deptAdminType = String(u.departmentAdminType || u.adminType || '').trim().toLowerCase();
  const designation = String(u.designation || '').trim().toLowerCase();

  // 1. Company Admin / Super Admin (explicit company admin roles & roleCodes)
  if (['company_admin', 'companyadmin', 'super_admin', 'superadmin'].includes(role)) return true;
  if (['TCCA1', 'COMPANY_ADMIN', 'COMPANYADMIN', 'TCSA1', 'SUPER_ADMIN', 'SUPERADMIN', 'APEXCA1'].includes(roleCode)) return true;
  if (/(company\s*admin|super\s*admin|company\s*administrator|super\s*administrator)/i.test(designation)) return true;

  // If role is generic 'admin' and not management/VP/AVP
  if (role === 'admin' || roleCode === 'ADMIN') {
    const isMgmt = /^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO)/i.test(roleCode) ||
      /(ceo|vp|vice president|general manager|president|chairman|^management$)/i.test(designation);
    if (!isMgmt) return true;
  }

  // 2. HR Admin
  if (['hr_admin', 'hradmin'].includes(role)) return true;
  if (['TCHR1', 'HR_ADMIN', 'HRADMIN', 'TCSF2A', 'TCSFA'].includes(roleCode)) return true;
  if (['hr'].includes(deptAdminType)) return true;
  if (/hr\s*admin/i.test(designation)) return true;

  // 3. Account / Finance Admin
  if (['account_admin', 'accounts_admin'].includes(role)) return true;
  if (['TCACC1', 'TCACC2', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN'].includes(roleCode)) return true;
  if (['accounts', 'account', 'finance'].includes(deptAdminType)) return true;
  if (/accounts?\s*admin|finance\s*admin/i.test(designation)) return true;

  // 4. Store Admin
  if (['store_admin', 'storeadmin'].includes(role)) return true;
  if (['TCSTR1', 'TCSTR2', 'STORE_ADMIN', 'STOREADMIN'].includes(roleCode)) return true;
  if (['store', 'warehouse'].includes(deptAdminType)) return true;
  if (/store\s*admin|warehouse\s*admin/i.test(designation)) return true;

  return false;
}

/** Management User check (CEOs, VPs, AVPs, GMs, Management category/roles; Directors excluded) */
function isManagementUser(u) {
  if (!u) return false;
  if (isDirectorRoleUser(u)) return false;
  if (isCeoUser(u)) return true;
  if (isExcludedAdmin(u)) return false;

  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const deptAdminType = String(u.departmentAdminType || u.adminType || '').trim().toLowerCase();
  const dept = String(u.department || '').trim().toLowerCase();
  const desig = String(u.designation || '').trim().toLowerCase();
  const cat = String(u.levelRef?.category || u.effectiveCategory || '').trim().toUpperCase();

  if (cat === 'MANAGEMENT') return true;
  if (['management', 'general_manager', 'vp', 'avp', 'ceo'].includes(role)) return true;
  if (['MANAGEMENT', 'TCMGT', 'VP', 'AVP', 'GM', 'CEO'].includes(roleCode)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO)/i.test(roleCode)) return true;
  if (deptAdminType === 'management') return true;
  if (/^(management|executive)$/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|^management$)/i.test(desig)) return true;

  return false;
}

/** Reporting Manager check (Direct team managers, Team Leads, Supervisors, Dept Heads, and Management/CEO users; Directors excluded) */
function isReportingManagerUser(u, mgrIds = []) {
  if (!u) return false;
  if (isDirectorRoleUser(u)) return false;
  if (isCeoUser(u)) return true;
  if (isExcludedAdmin(u)) return false;
  // Management users can also be reporting managers of other users
  if (isManagementUser(u)) return true;

  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const desig = String(u.designation || '').trim().toLowerCase();
  const cat = String(u.levelRef?.category || u.effectiveCategory || '').trim().toUpperCase();

  if (mgrIds.some((id) => String(id) === String(u._id))) return true;
  if (u.isTeamLead) return true;
  if (cat === 'LEADERSHIP') return true;
  if (['team_lead', 'teamlead', 'manager', 'lead', 'supervisor'].includes(role)) return true;
  if (/^TC(LD|TL)/i.test(roleCode) || roleCode === 'TEAM_LEAD') return true;
  if (/(team\s*lead|teamlead|lead\b|manager|supervisor|head\b)/i.test(desig)) return true;

  return false;
}

async function kindCondition(companyId, kind) {
  if (kind === 'FULL_PAYMENT') {
    const mgmtLevelIds = await getManagementLevelIds(companyId);
    const orConds = [
      { role: { $in: ['management', 'director', 'general_manager', 'vp', 'avp'] } },
      { roleCode: { $in: ['MANAGEMENT', 'TCMGT', 'TCDR1A', 'TCDR2A', 'VP', 'AVP', 'GM'] } },
      { roleCode: /^(TC(DI|MN|DR)|MANAGEMENT|TCMGT|VP|AVP|GM)/i },
      { departmentAdminType: 'management' },
      { adminType: 'management' },
      { department: /^(management|executive|board of directors|directors)$/i },
      { designation: /(director|managing director|board of directors|ceo|vp|vice president|general manager|president|chairman|^management$)/i },
    ];
    if (mgmtLevelIds.length) {
      orConds.push({ levelRef: { $in: mgmtLevelIds } });
    }
    return {
      $and: [
        { $or: orConds },
        APPROVER_EXCLUSIONS,
      ],
    };
  }

  if (kind === 'OTHER_EXPENSE') {
    const mgrIds = await reportingManagerIds(companyId);
    const leadLevelIds = await getLeadershipLevelIds(companyId);
    const mgmtLevelIds = await getManagementLevelIds(companyId);

    const orConds = [
      { _id: { $in: mgrIds } },
      { isTeamLead: true },
      { role: { $in: ['team_lead', 'teamlead', 'manager', 'lead', 'supervisor', 'management', 'director', 'general_manager', 'vp', 'avp'] } },
      { roleCode: { $in: ['TEAM_LEAD', 'MANAGEMENT', 'TCMGT', 'TCDR1A', 'TCDR2A', 'VP', 'AVP', 'GM'] } },
      { roleCode: /^(TC(LD|TL)|TEAM_LEAD|TC(DI|MN|DR)|MANAGEMENT|TCMGT|VP|AVP|GM)/i },
      { departmentAdminType: 'management' },
      { adminType: 'management' },
      { department: /^(management|executive|board of directors|directors)$/i },
      { designation: /(team\s*lead|teamlead|manager|supervisor|head\b|director|managing director|board of directors|ceo|vp|vice president|general manager|president|chairman|^management$)/i },
    ];
    if (leadLevelIds.length) {
      orConds.push({ levelRef: { $in: leadLevelIds } });
    }
    if (mgmtLevelIds.length) {
      orConds.push({ levelRef: { $in: mgmtLevelIds } });
    }
    return {
      $and: [
        { $or: orConds },
        APPROVER_EXCLUSIONS,
      ],
    };
  }

  return null;
}

/** Active, same-company users eligible to approve the given kind. */
async function listApprovers({ companyId, kind, excludeIds = [], search = '' }) {
  const cond = await kindCondition(companyId, kind);
  if (!cond) return [];
  const cCond = companyCond(companyId);
  const and = [cond, { status: { $nin: ACTIVE_USER_EXCLUDED } }];
  if (Object.keys(cCond).length > 0) {
    and.push(cCond);
  }
  const exclude = excludeIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  if (exclude.length) and.push({ _id: { $nin: exclude } });
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ name: rx }, { employeeIdCode: rx }, { designation: rx }, { department: rx }] });
  }
  const mgrIds = kind === 'OTHER_EXPENSE' ? await reportingManagerIds(companyId) : [];
  const users = await User.find({ $and: and })
    .select(SELECT)
    .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  if (kind === 'FULL_PAYMENT') {
    return users.filter((u) => isManagementUser(u));
  }
  if (kind === 'OTHER_EXPENSE') {
    return users.filter((u) => isReportingManagerUser(u, mgrIds));
  }
  return [];
}

/** The approver if eligible for this kind, otherwise null. */
async function findEligibleApprover({ companyId, kind, approverId }) {
  if (!mongoose.Types.ObjectId.isValid(String(approverId || ''))) return null;
  const cond = await kindCondition(companyId, kind);
  if (!cond) return null;
  const cCond = companyCond(companyId);
  const and = [{ _id: approverId }, cond, { status: { $nin: ACTIVE_USER_EXCLUDED } }];
  if (Object.keys(cCond).length > 0) {
    and.push(cCond);
  }
  const mgrIds = kind === 'OTHER_EXPENSE' ? await reportingManagerIds(companyId) : [];
  const user = await User.findOne({ $and: and })
    .select(SELECT)
    .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
    .lean();

  if (!user) return null;
  if (kind === 'FULL_PAYMENT' && !isManagementUser(user)) return null;
  if (kind === 'OTHER_EXPENSE' && !isReportingManagerUser(user, mgrIds)) return null;
  return user;
}

/** Can this user ever be an approver? (drives the mobile "Other Approvals" tile) */
async function isPotentialApprover(user, companyId) {
  if (!user || isExcludedAdmin(user)) return false;
  if (isManagementUser(user)) return true;
  const mgrIds = await reportingManagerIds(companyId);
  if (isReportingManagerUser(user, mgrIds)) return true;
  return false;
}

module.exports = {
  listApprovers,
  findEligibleApprover,
  isPotentialApprover,
  isManagementUser,
  isReportingManagerUser,
  isExcludedAdmin,
  isCeoUser,
  isDirectorRoleUser,
};

