const mongoose = require('mongoose');
const User = require('../../../../models/User');
const { ACTIVE_USER_EXCLUDED } = require('./claimRules');

/**
 * Approver lookup for the in-app expense approval stage.
 * - Step 1 (`FULL_PAYMENT`, `STOCK_PURCHASE`, `OTHER_EXPENSE`): Employee's Reporting Manager
 *   (or tagged above-hierarchy manager when a tagged employee is above the submitter's manager).
 * - Step 2 (`FULL_PAYMENT` & `STOCK_PURCHASE`): Company's designated CFO / Finance Head
 *   (handled by `financeApprovalService.js`).
 */

const SELECT = 'name fullName email employeeIdCode department designation role roleCode roleLevel departmentAdminType adminType levelRef isTeamLead responsibilityCodes reportsTo approver';

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

const companyLevelCond = (companyId) => {
  if (!companyId || companyId === 'ALL') return {};
  const ids = [String(companyId)];
  if (mongoose.Types.ObjectId.isValid(String(companyId))) {
    ids.push(new mongoose.Types.ObjectId(String(companyId)));
  }
  return {
    $or: [
      { companyId: { $in: ids } },
      { company: { $in: ids } },
      { companyId: null },
      { companyId: { $exists: false } },
    ],
  };
};

async function getManagementLevelIds(companyId) {
  try {
    const Level = mongoose.models.Level || require('../../../../models/Level');
    const levels = await Level.find({
      ...companyLevelCond(companyId),
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
      ...companyLevelCond(companyId),
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
  const name = String(u.name || u.fullName || '').trim().toLowerCase();
  const email = String(u.email || '').trim().toLowerCase();
  const role = String(u.role || '').trim().toLowerCase();
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  const desig = String(u.designation || '').trim().toLowerCase();
  const dept = String(u.department || '').trim().toLowerCase();
  const levelName = String(u.levelRef?.name || u.levelName || '').trim().toUpperCase();
  const levelCode = String(u.levelRef?.code || '').trim().toUpperCase();

  // Explicit recognition for CEO Minal Patil
  if (/minal\s*patil/i.test(name) || /minal\.ceo/i.test(email)) return true;

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

  // If role is generic 'admin' and not management/VP/AVP or a Team Lead / Manager / Leadership user
  if (role === 'admin' || roleCode === 'ADMIN') {
    const cat = String(u.levelRef?.category || u.effectiveCategory || '').trim().toUpperCase();
    const isMgmtOrLead =
      /^(TC(MN|LD|TL)|MANAGEMENT|TCMGT|TEAM_LEAD|VP|AVP|GM|CEO)/i.test(roleCode) ||
      cat === 'MANAGEMENT' ||
      cat === 'LEADERSHIP' ||
      Boolean(u.isTeamLead || u.levelRef?.canManageTeam || u.canManageTeam) ||
      /(ceo|vp|vice president|general manager|president|chairman|^management$|team\s*lead|teamlead|\btl\b|group\s*lead|manager|supervisor|head\b)/i.test(designation);
    if (!isMgmtOrLead) return true;
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
  const resp = Array.isArray(u.responsibilityCodes)
    ? u.responsibilityCodes
    : (u.responsibilityCodes ? [String(u.responsibilityCodes)] : []);

  if (resp.some((r) => String(r).toUpperCase().trim() === 'MANAGEMENT_APPROVER')) return true;
  if (cat === 'MANAGEMENT') return true;
  if (['management', 'general_manager', 'vp', 'avp', 'ceo'].includes(role)) return true;
  if (['MANAGEMENT', 'TCMGT', 'VP', 'AVP', 'GM', 'CEO'].includes(roleCode)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO)/i.test(roleCode)) return true;
  if (deptAdminType === 'management') return true;
  if (/^(management|executive)$/i.test(dept) || /management/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|management)/i.test(desig)) return true;

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
  const resp = Array.isArray(u.responsibilityCodes)
    ? u.responsibilityCodes
    : (u.responsibilityCodes ? [String(u.responsibilityCodes)] : []);

  if (resp.some((r) => String(r).toUpperCase().trim() === 'MANAGEMENT_APPROVER')) return true;
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
      { designation: /(director|managing director|board of directors|ceo|vp|vice president|general manager|president|chairman|management)/i },
      { responsibilityCodes: 'MANAGEMENT_APPROVER' },
      { name: /minal\s*patil/i },
      { email: /minal\.ceo/i },
    ];
    if (mgmtLevelIds.length) {
      orConds.push({ levelRef: { $in: mgmtLevelIds } });
    }
    return {
      $or: [
        {
          $and: [
            { $or: orConds },
            APPROVER_EXCLUSIONS,
          ],
        },
        { name: /minal\s*patil/i },
        { designation: /(^|\b)ceo(\b|$)/i },
        { role: 'ceo' },
        { roleCode: 'CEO' },
        { responsibilityCodes: 'MANAGEMENT_APPROVER' },
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
      { designation: /(team\s*lead|teamlead|manager|supervisor|head\b|director|managing director|board of directors|ceo|vp|vice president|general manager|president|chairman|management)/i },
      { responsibilityCodes: 'MANAGEMENT_APPROVER' },
      { name: /minal\s*patil/i },
      { email: /minal\.ceo/i },
    ];
    if (leadLevelIds.length) {
      orConds.push({ levelRef: { $in: leadLevelIds } });
    }
    if (mgmtLevelIds.length) {
      orConds.push({ levelRef: { $in: mgmtLevelIds } });
    }
    return {
      $or: [
        {
          $and: [
            { $or: orConds },
            APPROVER_EXCLUSIONS,
          ],
        },
        { name: /minal\s*patil/i },
        { designation: /(^|\b)ceo(\b|$)/i },
        { role: 'ceo' },
        { roleCode: 'CEO' },
        { responsibilityCodes: 'MANAGEMENT_APPROVER' },
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

  let filtered = [];
  if (kind === 'FULL_PAYMENT') {
    filtered = users.filter((u) => isManagementUser(u));
  } else if (kind === 'OTHER_EXPENSE') {
    filtered = users.filter((u) => isReportingManagerUser(u, mgrIds));
  }

  // Safe fallback if company has no specialized management users returned:
  // ensure eligible company leadership / management users are returned so the picker is never empty in production
  if (filtered.length === 0) {
    const fallbackUsers = await User.find({
      ...cCond,
      status: { $nin: ACTIVE_USER_EXCLUDED },
      $or: [
        { role: { $in: ['ceo', 'management', 'general_manager', 'vp', 'company_admin', 'admin'] } },
        { designation: /(ceo|managing director|general manager|president|management|manager|team\s*lead|head)/i },
        { responsibilityCodes: 'MANAGEMENT_APPROVER' },
      ],
      ...(exclude.length ? { _id: { $nin: exclude } } : {}),
    })
      .select(SELECT)
      .limit(20)
      .lean();

    filtered = fallbackUsers.filter((u) => {
      const r = String(u.role || '').toLowerCase();
      const d = String(u.designation || '').toLowerCase();
      if (['store_admin', 'account_admin', 'accounts_admin'].includes(r)) return false;
      if (/store\s*admin|accounts?\s*admin/i.test(d)) return false;
      return true;
    });
  }

  return filtered;
}

/** The approver if eligible for this kind, otherwise null. */
async function findEligibleApprover({ companyId, kind, approverId }) {
  if (!mongoose.Types.ObjectId.isValid(String(approverId || ''))) return null;
  // Both FULL_PAYMENT and OTHER_EXPENSE route to the employee's Reporting Manager (or higher hierarchy manager)
  const effectiveKind = (kind === 'FULL_PAYMENT' || kind === 'OTHER_EXPENSE') ? 'OTHER_EXPENSE' : kind;
  const cond = await kindCondition(companyId, effectiveKind);
  if (!cond) return null;
  const cCond = companyCond(companyId);
  const and = [{ _id: approverId }, cond, { status: { $nin: ACTIVE_USER_EXCLUDED } }];
  if (Object.keys(cCond).length > 0) {
    and.push(cCond);
  }
  const mgrIds = (kind === 'OTHER_EXPENSE' || kind === 'FULL_PAYMENT') ? await reportingManagerIds(companyId) : [];
  const user = await User.findOne({ $and: and })
    .select(SELECT)
    .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
    .lean();

  if (!user) {
    // Check fallback user
    const fallbackUser = await User.findOne({
      _id: approverId,
      ...cCond,
      status: { $nin: ACTIVE_USER_EXCLUDED },
    }).select(SELECT).populate('levelRef', 'name code category levelNumber canManageTeam canApprove').lean();
    if (fallbackUser) {
      const r = String(fallbackUser.role || '').toLowerCase();
      const d = String(fallbackUser.designation || '').toLowerCase();
      if (!['store_admin', 'account_admin', 'accounts_admin'].includes(r) && !/store\s*admin|accounts?\s*admin/i.test(d)) {
        return fallbackUser;
      }
    }
    return null;
  }
  if ((kind === 'FULL_PAYMENT' || kind === 'OTHER_EXPENSE') && !isReportingManagerUser(user, mgrIds) && !isManagementUser(user)) return null;
  return user;
}

/** Can this user ever be an approver? (drives the mobile "Other Approvals" tile) */
async function isPotentialApprover(user, companyId) {
  if (!user) return false;
  if (isCeoUser(user)) return true;
  if (isManagementUser(user)) return true;
  const mgrIds = await reportingManagerIds(companyId);
  if (isReportingManagerUser(user, mgrIds)) return true;
  if (!isExcludedAdmin(user)) {
    if (user.isTeamLead) return true;
    if (/(team\s*lead|teamlead|lead\b|manager|supervisor|head\b)/i.test(user.designation || '')) return true;
  }
  return false;
}

function isTeamLeadUser(u) {
  if (!u) return false;
  if (u.isTeamLead || u.levelRef?.canManageTeam || u.canManageTeam) return true;
  if (/^TC(LD|TL)/i.test(String(u.roleCode || '').trim())) return true;
  const text = `${u.levelRef?.name || u.levelName || ''} ${u.designation || ''} ${u.role || ''} ${u.roleCode || ''}`.toLowerCase();
  return /(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(text);
}

function inferRoleLevelFromText(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return null;
  if (/(^|[\s_])(ceo|chief[\s_]*executive)($|[\s_])/i.test(s)) return 2;
  if (/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(s)) return 4;
  if (/(^|[\s_])(vp|vice[\s_]*president)($|[\s_])/i.test(s)) return 3;
  if (/(^|[\s_])(gm|general[\s_]*manager)($|[\s_])/i.test(s)) return 5;
  if (/(^|[\s_])(group[\s_]*lead|group[\s_]*leader|manager)($|[\s_])/i.test(s)) return 6;
  if (/(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(s)) return 7;
  if (/senior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 8;
  if (/junior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 9;
  if (/team[\s_]*member/i.test(s)) return 10;
  if (/\btrainee\b/i.test(s)) return 11;
  if (/\bintern\b/i.test(s)) return 12;
  return null;
}

function getUserEffectiveLevel(u) {
  if (!u) return 99;
  if (isCeoUser(u)) return 2;
  const refLvl = Number(u.levelRef?.levelNumber ?? u.levelNumber);
  if (Number.isFinite(refLvl) && refLvl > 0) {
    if (isTeamLeadUser(u) && refLvl > 7) return 7;
    return refLvl;
  }
  const rLvl = Number(u.roleLevel);
  if (Number.isFinite(rLvl) && rLvl > 0) {
    if (isTeamLeadUser(u) && rLvl > 7) return 7;
    return rLvl;
  }
  const inferred = inferRoleLevelFromText(`${u.levelRef?.name || u.levelName || ''} ${u.designation || ''} ${u.role || ''} ${u.roleCode || ''}`);
  if (inferred !== null) return inferred;
  if (isTeamLeadUser(u)) return 7;
  const codeMatch = String(u.employeeIdCode || '').trim().match(/^[A-Z]{2,6}(\d{1,2})[A-Z]_/i);
  if (codeMatch) {
    const codeLvl = Number(codeMatch[1]);
    if (Number.isFinite(codeLvl) && codeLvl > 0) return codeLvl;
  }
  return 99;
}

function getRuleEffectiveLevel(rule) {
  if (!rule) return 99;
  const rLvl = Number(rule.levelNumber);
  if (Number.isFinite(rLvl) && rLvl > 0) return rLvl;
  const inferred = inferRoleLevelFromText(`${rule.roleName || ''} ${rule.roleKey || ''}`);
  return inferred ?? 99;
}

function doesUserMatchRuleRole(u, rule) {
  if (!u || !rule) return false;
  const effUserLvl = getUserEffectiveLevel(u);
  const effRuleLvl = getRuleEffectiveLevel(rule);
  if (rule.levelId && u.levelRef?._id && String(u.levelRef._id) === String(rule.levelId)) {
    if (effRuleLvl >= 99 || effUserLvl === effRuleLvl) return true;
  }
  if (rule.levelNumber && effUserLvl < 99 && effUserLvl === Number(rule.levelNumber)) return true;

  const rText = `${rule.roleName || ''} ${rule.roleKey || ''}`.trim().toLowerCase();
  const uText = `${u.levelRef?.name || u.levelName || ''} ${u.designation || ''} ${u.role || ''} ${u.roleCode || ''}`.trim().toLowerCase();
  if (!rText) return false;

  if (/(team[\s_]*lead|teamlead|\btl\b|\blead\b)/i.test(rText)) {
    if (isTeamLeadUser(u)) return true;
  }
  if (/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(rText)) {
    if (/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(uText)) return true;
  } else if (/(^|[\s_])(vp|vice[\s_]*president)($|[\s_])/i.test(rText)) {
    if (!/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(uText) && /(^|[\s_])(vp|vice[\s_]*president)($|[\s_])/i.test(uText)) return true;
  }
  if (/(^|[\s_])(gm|general[\s_]*manager)($|[\s_])/i.test(rText)) {
    if (/(^|[\s_])(gm|general[\s_]*manager)($|[\s_])/i.test(uText)) return true;
  } else if (/(^|[\s_])manager($|[\s_])/i.test(rText)) {
    if (!/(general[\s_]*manager)/i.test(uText) && /(^|[\s_])manager($|[\s_])/i.test(uText)) return true;
  }
  if (/(^|[\s_])(ceo|chief[\s_]*executive)($|[\s_])/i.test(rText)) {
    if (isCeoUser(u)) return true;
  }

  const cleanR = String(rule.roleName || '').trim().toLowerCase();
  if (cleanR) {
    const lvlName = String(u.levelRef?.name || u.levelName || '').trim().toLowerCase();
    const desig = String(u.designation || '').trim().toLowerCase();
    const role = String(u.role || '').trim().toLowerCase();
    if ((lvlName === cleanR || desig === cleanR || role === cleanR) && (effRuleLvl >= 99 || effUserLvl === effRuleLvl)) return true;
  }
  return false;
}

function resolveDirectAccountLimitForSingleUser(user, activeRules) {
  if (!user || !activeRules.length) return Number(activeRules[0]?.maxAmount ?? 0);
  // 1. Direct role / level match
  const matched = activeRules.find((r) => doesUserMatchRuleRole(user, r));
  if (matched) return Number(matched.maxAmount);

  // 2. "Till Role / Hierarchy Level" range match:
  // Smaller levelNumber = higher seniority (e.g. Tier 1: L8 Senior Executive -> Up to ₹50 Till L8;
  // Tier 2: L4 AVP -> ₹50–₹100 Till L4, which covers L7 Team Lead, L6 Manager, L5 GM, L4 AVP).
  const uLvl = getUserEffectiveLevel(user);
  if (uLvl > 0 && uLvl < 99) {
    const rulesWithLevel = activeRules
      .map((r) => ({ rule: r, rLvl: getRuleEffectiveLevel(r) }))
      .filter((x) => x.rLvl > 0 && x.rLvl < 99);
    if (rulesWithLevel.length > 0) {
      const tierMatch = rulesWithLevel.find((x) => uLvl >= x.rLvl);
      if (tierMatch) return Number(tierMatch.rule.maxAmount);
      // User is higher in seniority (smaller uLvl) than all configured tiers -> highest tier limit applies
      return Number(rulesWithLevel[rulesWithLevel.length - 1].rule.maxAmount);
    }
  }
  return Number(activeRules[0].maxAmount);
}

/**
 * Resolve the direct-to-Accounts payment limit (in ₹) from configured approvalLimitRules.
 * Supports either a single user object or an array of participant user objects on the claim.
 * For Pay-Limit-applicable claims:
 * - Amount <= directLimit -> goes directly to Accounts Admin (no Reporting Manager approval).
 * - Amount > directLimit  -> goes through Reporting Manager for approval.
 */
function resolveDirectAccountLimit(userOrUsers, approvalLimitRules = []) {
  const activeRules = (Array.isArray(approvalLimitRules) ? approvalLimitRules : [])
    .filter(
      (r) =>
        r &&
        r.status !== 'inactive' &&
        r.maxAmount !== null &&
        r.maxAmount !== undefined &&
        r.maxAmount !== '' &&
        Number(r.maxAmount) > 0
    )
    .slice()
    .sort((a, b) => {
      const diff = Number(a.maxAmount) - Number(b.maxAmount);
      if (diff !== 0) return diff;
      return getRuleEffectiveLevel(b) - getRuleEffectiveLevel(a);
    });
  if (activeRules.length === 0) return null;

  const users = (Array.isArray(userOrUsers) ? userOrUsers : [userOrUsers]).filter(Boolean);
  if (users.length === 0) return Number(activeRules[0].maxAmount);

  let bestLimit = null;
  for (const u of users) {
    const lim = resolveDirectAccountLimitForSingleUser(u, activeRules);
    if (Number.isFinite(lim) && (bestLimit === null || lim > bestLimit)) {
      bestLimit = lim;
    }
  }
  return bestLimit !== null ? bestLimit : Number(activeRules[0].maxAmount);
}

/**
 * Resolve the employee's Reporting Manager based on their hierarchy in their department:
 * 1. Direct assigned `reportsTo` or `approver` chain on the employee's User record.
 * 2. Immediate higher-level manager / team lead in the employee's department hierarchy.
 * 3. Fallback to company-wide reporting manager / management hierarchy.
 * Note: Escalation to the one-step-above Reporting Manager happens ONLY when the employee's
 * Reporting Manager / Team Lead is tagged as a participant on the claim (never based on claim amount).
 */
async function resolveEmployeeReportingManagerWithMeta(userOrId, companyId, excludeIds = [], options = {}) {
  try {
    const uid = userOrId && typeof userOrId === 'object' ? (userOrId._id || userOrId.id) : userOrId;
    if (!uid || !mongoose.Types.ObjectId.isValid(String(uid))) {
      return { approver: null, approvalLimitRules: [], directLimit: null, matchedRule: null, exceededRules: [] };
    }

    const cCond = companyCond(companyId);
    const excludeSet = new Set([String(uid), ...(excludeIds || []).map(String)]);

    const emp = await User.findById(uid)
      .select('name department designation role roleCode roleLevel isTeamLead reportsTo approver levelRef companyId company')
      .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
      .lean();
    if (!emp) {
      return { approver: null, approvalLimitRules: [], directLimit: null, matchedRule: null, exceededRules: [] };
    }

    // Load dynamic approval limit rules from options or active ExpensePolicy
    let rawRules = options.approvalLimitRules;
    if (!Array.isArray(rawRules)) {
      try {
        const ExpensePolicy = mongoose.models.ExpensePolicy || require('../models/ExpensePolicy');
        const activePolicy = await ExpensePolicy.findOne({
          ...cCond,
          status: 'active',
        }).select('approvalLimitRules').sort({ createdAt: -1 }).lean();
        rawRules = activePolicy?.approvalLimitRules || [];
      } catch (_) {
        rawRules = [];
      }
    }

    const activeRules = (Array.isArray(rawRules) ? rawRules : [])
      .filter((r) => r && r.status !== 'inactive' && String(r.roleName || '').trim())
      .slice()
      .sort((a, b) => {
        const aHasMax = a.maxAmount !== null && a.maxAmount !== undefined && a.maxAmount !== '';
        const bHasMax = b.maxAmount !== null && b.maxAmount !== undefined && b.maxAmount !== '';
        if (aHasMax && bHasMax) return Number(a.maxAmount) - Number(b.maxAmount);
        if (aHasMax !== bHasMax) return aHasMax ? -1 : 1;
        return getRuleEffectiveLevel(a) - getRuleEffectiveLevel(b);
      });

    // 1. Walk direct reporting manager chain in org hierarchy (reportsTo / approver up to 6 hops)
    // Also inspect any tagged employees (excludeIds) so if a tagged employee IS the reporting manager / team lead,
    // we walk up from that tagged manager's reportsTo/approver and enforce a higher hierarchy level.
    const mgrIds = await reportingManagerIds(companyId);
    const empLevel = getUserEffectiveLevel(emp);
    const empIsLeadOrMgr = isTeamLeadUser(emp) || empLevel <= 7;

    const otherTaggedIds = (excludeIds || [])
      .map((x) => (x && typeof x === 'object' ? (x._id || x.id) : x))
      .filter((id) => id && String(id) !== String(uid) && mongoose.Types.ObjectId.isValid(String(id)));

    const taggedUsers = otherTaggedIds.length > 0
      ? await User.find({
          _id: { $in: otherTaggedIds },
          ...cCond,
        })
          .select('name department designation role roleCode roleLevel isTeamLead reportsTo approver levelRef companyId company')
          .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
          .lean()
      : [];

    const empDirectMgrIds = [emp.reportsTo, emp.approver]
      .map((x) => (x && typeof x === 'object' ? String(x._id || x) : String(x || '')))
      .filter(Boolean);

    let minParticipantLevel = empLevel;
    let hasTaggedManager = false;
    let hasTaggedTeamLead = false;
    const taggedManagerNextSeeds = [];

    for (const tu of taggedUsers) {
      const tuId = String(tu._id);
      const tuIsTeamLead = isTeamLeadUser(tu);
      const rawTuLvl = getUserEffectiveLevel(tu);
      const tuLvl = rawTuLvl < 99 ? rawTuLvl : (tuIsTeamLead ? 7 : 99);
      const isDirectMgrOfEmp = empDirectMgrIds.includes(tuId);
      const isMgrRole =
        isReportingManagerUser(tu, mgrIds) ||
        tuIsTeamLead ||
        Boolean(tu.levelRef?.canApprove || tu.canApprove) ||
        tuLvl <= 7;
      if (isDirectMgrOfEmp || isMgrRole) {
        hasTaggedManager = true;
        if (tuLvl < minParticipantLevel) {
          minParticipantLevel = tuLvl;
        }
        if (tuIsTeamLead) {
          hasTaggedTeamLead = true;
          if (minParticipantLevel > 7) minParticipantLevel = 7;
        }
        if (tu.reportsTo) taggedManagerNextSeeds.push(tu.reportsTo);
        if (tu.approver) taggedManagerNextSeeds.push(tu.approver);
      }
    }

    const chainCandidates = [];
    const chainVisited = new Set([String(uid)]);
    let frontier = [emp.reportsTo, emp.approver, ...taggedManagerNextSeeds]
      .map((x) => (x && typeof x === 'object' ? x._id : x))
      .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

    for (let hop = 0; hop < 6 && frontier.length > 0; hop++) {
      const nextFrontier = [];
      for (const dId of frontier) {
        const idStr = String(dId);
        if (chainVisited.has(idStr)) continue;
        chainVisited.add(idStr);
        // eslint-disable-next-line no-await-in-loop
        const mgrDoc = await User.findOne({
          _id: dId,
          ...cCond,
          status: { $nin: ACTIVE_USER_EXCLUDED },
        })
          .select(SELECT)
          .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
          .lean();
        if (mgrDoc) {
          const mgrLvl = getUserEffectiveLevel(mgrDoc);
          const mgrIsTeamLead = isTeamLeadUser(mgrDoc);
          if (excludeSet.has(idStr) && idStr !== String(uid)) {
            hasTaggedManager = true;
            if (mgrIsTeamLead) {
              hasTaggedTeamLead = true;
              if (minParticipantLevel > 7) minParticipantLevel = 7;
            }
            if (mgrLvl < minParticipantLevel) {
              minParticipantLevel = mgrLvl;
            }
          } else if (!isExcludedAdmin(mgrDoc) && !isDirectorRoleUser(mgrDoc)) {
            const disqualifiedByTag =
              hasTaggedManager &&
              ((minParticipantLevel < 99 && mgrLvl >= minParticipantLevel) ||
                (hasTaggedTeamLead && mgrIsTeamLead));
            if (!disqualifiedByTag) {
              chainCandidates.push(mgrDoc);
            }
          }
          if (mgrDoc.reportsTo) nextFrontier.push(mgrDoc.reportsTo);
          if (mgrDoc.approver) nextFrontier.push(mgrDoc.approver);
        }
      }
      frontier = nextFrontier;
    }

    // 2. Department hierarchy lookup: managers in the employee's department sorted closest-supervisor-first
    const deptCandidates = [];
    const dept = String(emp.department || '').trim();
    if (dept) {
      const escapedDept = dept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const deptUsers = await User.find({
        ...cCond,
        status: { $nin: ACTIVE_USER_EXCLUDED },
        _id: { $nin: [...excludeSet].filter((id) => mongoose.Types.ObjectId.isValid(id)) },
        department: { $regex: `^${escapedDept}$`, $options: 'i' },
      })
        .select(SELECT)
        .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
        .lean();

      const filteredDept = deptUsers.filter((u) => {
        if (isExcludedAdmin(u) || isDirectorRoleUser(u)) return false;
        const uLvl = getUserEffectiveLevel(u);
        if (hasTaggedManager) {
          if (minParticipantLevel < 99 && uLvl >= minParticipantLevel) return false;
          if (hasTaggedTeamLead && isTeamLeadUser(u)) return false;
        }
        return (
          isReportingManagerUser(u, mgrIds) ||
          isTeamLeadUser(u) ||
          u.levelRef?.canApprove ||
          (uLvl < minParticipantLevel)
        );
      });

      filteredDept.sort((a, b) => {
        const aLead = isTeamLeadUser(a);
        const bLead = isTeamLeadUser(b);
        if (!hasTaggedManager && !empIsLeadOrMgr && aLead !== bLead) {
          return aLead ? -1 : 1;
        }
        const aLvl = getUserEffectiveLevel(a);
        const bLvl = getUserEffectiveLevel(b);
        const aAbove = aLvl < minParticipantLevel;
        const bAbove = bLvl < minParticipantLevel;
        if (aAbove !== bAbove) return aAbove ? -1 : 1;
        if (aAbove && bAbove && aLvl !== bLvl) return bLvl - aLvl;
        if (aLead !== bLead) return aLead ? -1 : 1;
        if (aLvl !== bLvl) return bLvl - aLvl;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      deptCandidates.push(...filteredDept);
    }

    // 3. Company-wide reporting manager & management hierarchy candidates
    const allManagers = await listApprovers({
      companyId,
      kind: 'OTHER_EXPENSE',
      excludeIds: [...excludeSet],
    });
    const sortedCompanyManagers = [...allManagers].sort((a, b) => {
      const aSameDept = dept && String(a.department || '').trim().toLowerCase() === dept.toLowerCase();
      const bSameDept = dept && String(b.department || '').trim().toLowerCase() === dept.toLowerCase();
      if (aSameDept !== bSameDept) return aSameDept ? -1 : 1;
      const aLead = isTeamLeadUser(a);
      const bLead = isTeamLeadUser(b);
      if (!hasTaggedManager && !empIsLeadOrMgr && aSameDept && bSameDept && aLead !== bLead) {
        return aLead ? -1 : 1;
      }
      const aLvl = getUserEffectiveLevel(a);
      const bLvl = getUserEffectiveLevel(b);
      const aAbove = aLvl < minParticipantLevel;
      const bAbove = bLvl < minParticipantLevel;
      if (aAbove !== bAbove) return aAbove ? -1 : 1;
      if (aAbove && bAbove && aLvl !== bLvl) return bLvl - aLvl;
      if (aLvl !== bLvl) return bLvl - aLvl;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const aboveTaggedCompanyManagers = hasTaggedManager
      ? sortedCompanyManagers.filter((u) => {
          const uLvl = getUserEffectiveLevel(u);
          if (minParticipantLevel < 99 && uLvl >= minParticipantLevel) return false;
          if (hasTaggedTeamLead && isTeamLeadUser(u)) return false;
          return true;
        })
      : sortedCompanyManagers;
    const companyCandidates = aboveTaggedCompanyManagers.length > 0 ? aboveTaggedCompanyManagers : sortedCompanyManagers;

    const directLimit = resolveDirectAccountLimit([emp, ...taggedUsers], activeRules);
    const matchedRule = directLimit !== null
      ? (activeRules.find((r) => Number(r.maxAmount) === Number(directLimit)) || activeRules[0] || null)
      : (activeRules[0] || null);
    const chosenApprover = chainCandidates[0] || deptCandidates[0] || companyCandidates[0] || null;

    return {
      approver: chosenApprover,
      approvalLimitRules: activeRules,
      directLimit,
      matchedRule,
      exceededRules: [],
    };
  } catch (_) {
    return { approver: null, approvalLimitRules: [], directLimit: null, matchedRule: null, exceededRules: [] };
  }
}

async function resolveEmployeeReportingManager(userOrId, companyId, excludeIds = [], options = {}) {
  const res = await resolveEmployeeReportingManagerWithMeta(userOrId, companyId, excludeIds, options);
  return res.approver || null;
}

module.exports = {
  listApprovers,
  findEligibleApprover,
  isPotentialApprover,
  resolveEmployeeReportingManager,
  resolveEmployeeReportingManagerWithMeta,
  resolveDirectAccountLimit,
  doesUserMatchRuleRole,
  getUserEffectiveLevel,
  getRuleEffectiveLevel,
  isTeamLeadUser,
  isManagementUser,
  isReportingManagerUser,
  isExcludedAdmin,
  isCeoUser,
  isDirectorRoleUser,
};

