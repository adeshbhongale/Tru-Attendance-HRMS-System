const mongoose = require('mongoose');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const User = require('../models/User');
const Level = require('../models/Level');
const Responsibility = require('../models/Responsibility');

/**
 * Layer 4: Evaluate condition rules against payload
 */
const matchesCondition = (condition, payload) => {
  const { field, operator, value, minValue, maxValue } = condition;
  const fieldValue = payload[field];

  if (fieldValue === undefined || fieldValue === null) return false;

  const numFieldValue = Number(fieldValue);
  const numVal = Number(value);

  switch (operator) {
    case 'eq':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
    case 'gt':
      return !isNaN(numFieldValue) && numFieldValue > numVal;
    case 'gte':
      return !isNaN(numFieldValue) && numFieldValue >= numVal;
    case 'lt':
      return !isNaN(numFieldValue) && numFieldValue < numVal;
    case 'lte':
      return !isNaN(numFieldValue) && numFieldValue <= numVal;
    case 'between':
      return !isNaN(numFieldValue) && numFieldValue >= Number(minValue) && numFieldValue <= Number(maxValue);
    default:
      return false;
  }
};

const getObjIdStr = (obj) => {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (obj._id) return obj._id.toString();
  return obj.toString();
};

/**
 * Layer 1: Find highest priority matching workflow for module & payload
 */
const findMatchingWorkflow = async (moduleName, payload = {}, requester = {}) => {
  // Normalize module name (e.g., 'Material', 'material_request', 'material_movement' -> regex match)
  const normModule = (moduleName || '').toLowerCase().replace(/_/g, '');
  const query = { status: 'active' };

  const allWorkflows = await ApprovalWorkflow.find(query).sort({ priorityOrder: 1 }).lean();
  
  const workflows = allWorkflows.filter(wf => {
    const wfMod = (wf.module || '').toLowerCase().replace(/_/g, '');
    return wfMod === normModule || wfMod.includes(normModule) || normModule.includes(wfMod);
  });

  const getReqCompId = (user) => {
    if (!user) return '';
    return getObjIdStr(user.companyId) || getObjIdStr(user.company) || '';
  };

  const getWfCompId = (wf) => {
    if (!wf) return '';
    return getObjIdStr(wf.companyId) || getObjIdStr(wf.company) || '';
  };

  const reqComp = getReqCompId(requester);

  for (const wf of workflows) {
    const wfComp = getWfCompId(wf);
    // Check company filter
    if (wfComp && reqComp && wfComp !== reqComp) {
      continue;
    }
    // Check branch filter
    if (wf.branch && payload.branch && wf.branch.toLowerCase() !== payload.branch.toLowerCase()) {
      continue;
    }
    // Check documentType filter
    if (wf.documentType && payload.documentType && wf.documentType.toLowerCase() !== payload.documentType.toLowerCase()) {
      continue;
    }
    // Check materialType filter
    if (wf.materialType && payload.materialType && wf.materialType.toLowerCase() !== payload.materialType.toLowerCase()) {
      continue;
    }

    // Check conditions
    if (!wf.conditions || wf.conditions.length === 0) {
      return wf; // Default match
    }

    const allConditionsMatched = wf.conditions.every(cond => matchesCondition(cond, payload));
    if (allConditionsMatched) {
      return wf;
    }
  }

  return workflows[0] || null;
};

/**
 * Layer 2: Step Resolver - Resolve approver user for a single workflow step.
 */
const resolveStepApprover = async (step, requester = {}) => {
  const approverRule = step.approverRule || step.approverType;
  const { targetLevelNumber, targetCategory, targetRole, targetResponsibility, targetUser, targetDepartment } = step;

  if (approverRule === 'REQUESTER') {
    if (requester && requester._id) {
      return { _id: requester._id, name: requester.name || requester.fullName, email: requester.email, role: requester.role, department: requester.department };
    }
  }

  if (approverRule === 'STORE_ADMIN') {
    const storeAdmin = await User.findOne({
      $or: [
        { role: { $in: ['store_admin', 'store', 'tcstr1', 'store_manager'] } },
        { roleCode: { $in: ['STORE_ADMIN', 'TCSTR1', 'STORE'] } }
      ],
      status: 'active'
    }).select('_id name email role roleCode department');
    if (storeAdmin) return storeAdmin;
  }

  if (approverRule === 'ACCOUNT_ADMIN') {
    const accountAdmin = await User.findOne({
      $or: [
        { role: { $in: ['account_admin', 'accounts', 'finance', 'tcacc1', 'tcacc2'] } },
        { roleCode: { $in: ['ACCOUNT_ADMIN', 'TCACC1', 'TCACC2', 'FINANCE'] } }
      ],
      status: 'active'
    }).select('_id name email role roleCode department');
    if (accountAdmin) return accountAdmin;
  }

  if (approverRule === 'HR_ADMIN') {
    const hrAdmin = await User.findOne({
      $or: [
        { role: { $in: ['hr_admin', 'hr', 'tcsf2a', 'tcsfa', 'hr_manager'] } },
        { roleCode: { $in: ['HR_ADMIN', 'TCSF2A', 'TCSFA', 'HR'] } }
      ],
      status: 'active'
    }).select('_id name email role roleCode department');
    if (hrAdmin) return hrAdmin;
  }

  if (approverRule === 'COMPANY_ADMIN') {
    const companyAdmin = await User.findOne({
      $or: [
        { role: { $in: ['company_admin', 'companyadmin', 'admin', 'tcca1'] } },
        { roleCode: { $in: ['COMPANY_ADMIN', 'TCCA1', 'ADMIN'] } }
      ],
      status: 'active'
    }).select('_id name email role roleCode department');
    if (companyAdmin) return companyAdmin;
  }

  if (approverRule === 'SUPER_ADMIN') {
    const superAdmin = await User.findOne({
      $or: [
        { role: { $in: ['super_admin', 'superadmin', 'tcsa1'] } },
        { roleCode: { $in: ['SUPER_ADMIN', 'TCSA1', 'SUPERADMIN'] } },
        { scope: 'GLOBAL' }
      ],
      status: 'active'
    }).select('_id name email role roleCode department');
    if (superAdmin) return superAdmin;
  }

  if (approverRule === 'ANY_EMPLOYEE') {
    const anyEmp = await User.findOne({ status: 'active', _id: { $ne: requester._id } }).select('_id name email role roleCode department');
    if (anyEmp) return anyEmp;
  }

  if ((approverRule === 'EMPLOYEE' || approverRule === 'SPECIFIC_USER') && targetUser) {
    return await User.findById(targetUser).select('_id name email role roleCode department');
  }

  if (approverRule === 'IMMEDIATE_MANAGER' || approverRule === 'REPORTS_TO') {
    const compFilter = (requester.companyId || requester.company)
      ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
      : {};

    if (requester.reportsTo) {
      const manager = await User.findOne({ _id: requester.reportsTo, ...compFilter, status: 'active' }).select('_id name fullName email role roleCode department');
      if (manager) return manager;
    }
    if (requester.approver) {
      const app = await User.findOne({ _id: requester.approver, ...compFilter, status: 'active' }).select('_id name fullName email role roleCode department');
      if (app) return app;
    }
    // Fallback to department lead/head within requester's department
    if (requester.department) {
      const deptHead = await User.findOne({
        ...compFilter,
        department: requester.department,
        role: { $in: ['department_admin', 'admin', 'manager', 'team_lead'] },
        _id: { $ne: requester._id },
        status: 'active'
      }).select('_id name fullName email role roleCode department');
      if (deptHead) return deptHead;
    }
  }

  if (approverRule === 'DEPARTMENT_HEAD') {
    const deptToSearch = targetDepartment ? (await mongoose.model('Department').findById(targetDepartment))?.name : requester.department;
    const deptHead = await User.findOne({
      department: deptToSearch,
      role: { $in: ['department_admin', 'admin', 'super_admin'] },
    }).select('_id name email role roleCode department');
    if (deptHead) return deptHead;
  }

  if (approverRule === 'MANAGEMENT_CATEGORY' || targetCategory) {
    const rawCat = (targetCategory || 'MANAGEMENT').toUpperCase();
    const compFilter = (requester.companyId || requester.company)
      ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
      : {};

    const levelsInCat = await Level.find({
      category: rawCat,
      status: 'active'
    }).select('_id');
    const levelIds = levelsInCat.map(l => l._id);

    let categoryCriteria = [];

    if (rawCat === 'DIRECTOR') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['director', 'founder', 'ceo', 'super_admin', 'superadmin'] } },
        { roleCode: { $in: ['DIRECTOR', 'CEO', 'FOUNDER', 'TCSA1'] } },
        { roleLevel: { $in: [1, 2] } }
      ];
    } else if (rawCat === 'MANAGEMENT') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['management', 'company_admin', 'admin', 'vp', 'avp', 'general_manager'] } },
        { roleCode: { $in: ['MANAGEMENT', 'TCMGT', 'TCCA1', 'VP', 'AVP', 'GM'] } },
        { departmentAdminType: 'management' },
        { adminType: 'management' },
        { roleLevel: { $in: [3, 4] } }
      ];
    } else if (rawCat === 'LEADERSHIP') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['leadership', 'manager', 'group_lead', 'team_lead'] } },
        { roleCode: { $in: ['LEADERSHIP', 'MANAGER', 'TCTL', 'LEAD'] } },
        { departmentAdminType: { $in: ['admin', 'manager', 'lead'] } },
        { roleLevel: { $in: [5, 6, 7, 8] } }
      ];
    } else if (rawCat === 'STAFF') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['staff', 'senior_executive', 'executive', 'employee'] } },
        { roleLevel: { $in: [7, 8, 9, 10] } }
      ];
    } else if (rawCat === 'TRAINEE') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['trainee', 'intern'] } },
        { roleLevel: { $in: [11, 12, 13] } }
      ];
    } else {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: rawCat.toLowerCase() }
      ];
    }

    const userInCat = await User.findOne({
      ...compFilter,
      $or: categoryCriteria,
      _id: { $ne: requester._id },
      status: 'active'
    }).select('_id name fullName email role roleCode department');
    if (userInCat) return userInCat;
  }

  if (approverRule === 'ROLE' || targetRole || targetLevelNumber) {
    let targetNum = Number(targetLevelNumber);
    if (isNaN(targetNum) && targetRole) {
      const matchNum = String(targetRole).match(/\d+/);
      if (matchNum) targetNum = parseInt(matchNum[0]);
    }

    const isTeamLeadStep = (targetRole && /team lead|tl/i.test(targetRole)) || targetNum === 7 || targetNum === 8 || (step.stepName && /team lead|tl/i.test(step.stepName));

    // Department-scoped Team Lead resolution
    if (isTeamLeadStep && requester.department) {
      const compFilter = (requester.companyId || requester.company)
        ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
        : {};

      const deptTL = await User.findOne({
        ...compFilter,
        department: requester.department,
        $or: [
          { role: 'team_lead' },
          { roleLevel: { $in: [7, 8] } },
          { roleCode: { $regex: /TL/i } }
        ],
        _id: { $ne: requester._id },
        status: 'active'
      }).select('_id name fullName email role roleCode department');

      if (deptTL) return deptTL;

      if (requester.reportsTo) {
        const directMgr = await User.findById(requester.reportsTo).select('_id name fullName email role roleCode department');
        if (directMgr) return directMgr;
      }
    }

    if (!isNaN(targetNum)) {
      const targetLevel = await Level.findOne({ levelNumber: targetNum, status: 'active' });
      if (targetLevel) {
        const compFilter = (requester.companyId || requester.company)
          ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
          : {};

        const userAtLevel = await User.findOne({
          ...compFilter,
          levelRef: targetLevel._id,
          _id: { $ne: requester._id },
          status: 'active'
        }).select('_id name fullName email role roleCode department');
        if (userAtLevel) return userAtLevel;
      }
    }

    const userWithRole = await User.findOne({
      $or: [
        { role: (targetRole || '').toLowerCase() },
        { roleCode: (targetRole || '').toUpperCase() },
        { roleLevel: targetNum }
      ],
      _id: { $ne: requester._id },
      status: 'active'
    }).select('_id name fullName email role roleCode department');
    if (userWithRole) return userWithRole;
  }

  if (approverRule === 'RESPONSIBILITY' && targetResponsibility) {
    const resp = await Responsibility.findOne({ code: targetResponsibility.toUpperCase() }).populate('assignedEmployees');
    if (resp && resp.assignedEmployees && resp.assignedEmployees.length > 0) {
      const assigned = resp.assignedEmployees.find(e => e._id.toString() !== requester._id.toString()) || resp.assignedEmployees[0];
      return {
        _id: assigned._id,
        name: assigned.name,
        email: assigned.email,
        role: assigned.role,
        roleCode: assigned.roleCode,
        department: assigned.department,
      };
    }
    const userWithResp = await User.findOne({
      responsibilityCodes: targetResponsibility.toUpperCase(),
      _id: { $ne: requester._id },
    }).select('_id name email role roleCode department');
    if (userWithResp) return userWithResp;
  }

  if (approverRule === 'LEVEL' && targetLevelNumber) {
    const targetLevel = await Level.findOne({ levelNumber: targetLevelNumber, status: 'active' });
    if (targetLevel) {
      const userAtLevel = await User.findOne({
        levelRef: targetLevel._id,
        _id: { $ne: requester._id },
      }).select('_id name email role roleCode department');
      if (userAtLevel) return userAtLevel;
    }

    let currentManagerId = requester.reportsTo;
    let traverseCount = 0;
    while (currentManagerId && traverseCount < 20) {
      traverseCount++;
      const mgr = await User.findById(currentManagerId).populate('levelRef').lean();
      if (!mgr) break;
      if (mgr.levelRef && mgr.levelRef.levelNumber <= targetLevelNumber) {
        return {
          _id: mgr._id,
          name: mgr.name,
          email: mgr.email,
          role: mgr.role,
          roleCode: mgr.roleCode,
          department: mgr.department,
        };
      }
      currentManagerId = mgr.reportsTo;
    }

    const fallbackLevel = await Level.findOne({
      levelNumber: { $lte: targetLevelNumber },
      status: 'active',
    }).sort({ levelNumber: 1 });
    if (fallbackLevel) {
      const fallbackUser = await User.findOne({
        levelRef: fallbackLevel._id,
        _id: { $ne: requester._id },
      }).select('_id name email role roleCode department');
      if (fallbackUser) return fallbackUser;
    }
  }

  // General fallback: Admin
  const defaultAdmin = await User.findOne({ role: { $in: ['super_admin', 'company_admin', 'admin'] } }).select('_id name email role roleCode department');
  return defaultAdmin;
};

/**
 * Get all candidate users matching a step's approver rule (for Mobile App / UI dropdowns)
 */
const getCandidateApprovers = async (step, requester = {}) => {
  const approverRule = step.approverRule || step.approverType;
  const { targetCategory, targetLevelNumber, targetRole, targetUser } = step;

  if (approverRule === 'REQUESTER') {
    if (requester && (requester._id || requester.id)) {
      return [{ _id: requester._id || requester.id, name: requester.name || requester.fullName || 'Requester', role: requester.role || 'Staff', department: requester.department }];
    }
    return await User.find({ status: 'active' }).select('_id name email role department').limit(1);
  }

  if (approverRule === 'ANY_EMPLOYEE') {
    return await User.find({ status: 'active' }).select('_id name email role department').limit(100);
  }

  if (approverRule === 'IMMEDIATE_MANAGER' || approverRule === 'REPORTS_TO') {
    const compFilter = (requester.companyId || requester.company)
      ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
      : {};

    if (requester.reportsTo) {
      const mgr = await User.findOne({ _id: requester.reportsTo, ...compFilter, status: 'active' }).select('_id name fullName email role department');
      if (mgr) return [mgr];
    }
    if (requester.approver) {
      const app = await User.findOne({ _id: requester.approver, ...compFilter, status: 'active' }).select('_id name fullName email role department');
      if (app) return [app];
    }
    if (requester.department) {
      const deptMgr = await User.findOne({
        ...compFilter,
        department: requester.department,
        role: { $in: ['manager', 'department_admin', 'team_lead'] },
        _id: { $ne: requester._id || requester.id },
        status: 'active'
      }).select('_id name fullName email role department');
      if (deptMgr) return [deptMgr];
    }
    return [];
  }

  if (approverRule === 'SPECIFIC_USER' || approverRule === 'EMPLOYEE') {
    if (targetUser) {
      const u = await User.findById(targetUser).select('_id name email role department');
      return u ? [u] : [];
    }
    return await User.find({ status: 'active' }).select('_id name email role department').limit(50);
  }

  if (approverRule === 'STORE_ADMIN') {
    return await User.find({
      $or: [
        { role: { $in: ['store_admin', 'store', 'tcstr1', 'store_manager', 'super_admin', 'company_admin', 'admin'] } },
        { roleCode: { $in: ['STORE_ADMIN', 'TCSTR1', 'STORE', 'TCCA1', 'TCSA1'] } }
      ],
      status: 'active'
    }).select('_id name email role department');
  }

  if (approverRule === 'ACCOUNT_ADMIN') {
    return await User.find({
      $or: [
        { role: { $in: ['account_admin', 'accounts', 'finance', 'tcacc1', 'tcacc2', 'super_admin', 'company_admin', 'admin'] } },
        { roleCode: { $in: ['ACCOUNT_ADMIN', 'TCACC1', 'TCACC2', 'FINANCE', 'TCCA1', 'TCSA1'] } }
      ],
      status: 'active'
    }).select('_id name email role department');
  }

  if (approverRule === 'HR_ADMIN') {
    return await User.find({
      $or: [
        { role: { $in: ['hr_admin', 'hr', 'tcsf2a', 'tcsfa', 'hr_manager', 'super_admin', 'company_admin', 'admin'] } },
        { roleCode: { $in: ['HR_ADMIN', 'TCSF2A', 'TCSFA', 'HR', 'TCCA1', 'TCSA1'] } }
      ],
      status: 'active'
    }).select('_id name email role department');
  }

  if (approverRule === 'COMPANY_ADMIN') {
    return await User.find({
      $or: [
        { role: { $in: ['company_admin', 'companyadmin', 'admin', 'tcca1', 'super_admin', 'superadmin'] } },
        { roleCode: { $in: ['COMPANY_ADMIN', 'TCCA1', 'ADMIN', 'TCSA1', 'SUPERADMIN'] } }
      ],
      status: 'active'
    }).select('_id name email role department');
  }

  if (approverRule === 'SUPER_ADMIN') {
    return await User.find({
      $or: [
        { role: { $in: ['super_admin', 'superadmin', 'tcsa1'] } },
        { roleCode: { $in: ['SUPER_ADMIN', 'TCSA1', 'SUPERADMIN'] } },
        { scope: 'GLOBAL' }
      ],
      status: 'active'
    }).select('_id name email role department');
  }

  if (approverRule === 'MANAGEMENT_CATEGORY' || targetCategory) {
    const rawCat = (targetCategory || 'MANAGEMENT').toUpperCase();
    const compFilter = (requester.companyId || requester.company)
      ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
      : {};

    const levelsInCat = await Level.find({
      category: rawCat,
      status: 'active'
    }).select('_id');
    const levelIds = levelsInCat.map(l => l._id);

    let categoryCriteria = [];

    if (rawCat === 'DIRECTOR') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['director', 'founder', 'ceo', 'super_admin', 'superadmin'] } },
        { roleCode: { $in: ['DIRECTOR', 'CEO', 'FOUNDER', 'TCSA1'] } },
        { roleLevel: { $in: [1, 2] } }
      ];
    } else if (rawCat === 'MANAGEMENT') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['management', 'company_admin', 'admin', 'vp', 'avp', 'general_manager'] } },
        { roleCode: { $in: ['MANAGEMENT', 'TCMGT', 'TCCA1', 'VP', 'AVP', 'GM'] } },
        { departmentAdminType: 'management' },
        { adminType: 'management' },
        { roleLevel: { $in: [3, 4] } }
      ];
    } else if (rawCat === 'LEADERSHIP') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['leadership', 'manager', 'group_lead', 'team_lead'] } },
        { roleCode: { $in: ['LEADERSHIP', 'MANAGER', 'TCTL', 'LEAD'] } },
        { departmentAdminType: { $in: ['admin', 'manager', 'lead'] } },
        { roleLevel: { $in: [5, 6, 7, 8] } }
      ];
    } else if (rawCat === 'STAFF') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['staff', 'senior_executive', 'executive', 'employee'] } },
        { roleLevel: { $in: [7, 8, 9, 10] } }
      ];
    } else if (rawCat === 'TRAINEE') {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: { $in: ['trainee', 'intern'] } },
        { roleLevel: { $in: [11, 12, 13] } }
      ];
    } else {
      categoryCriteria = [
        { levelRef: { $in: levelIds } },
        { role: rawCat.toLowerCase() }
      ];
    }

    const mgtUsers = await User.find({
      ...compFilter,
      $or: categoryCriteria,
      _id: { $ne: requester._id || requester.id },
      status: 'active'
    }).select('_id name fullName email role department').limit(50);

    return mgtUsers || [];
  }

  if (approverRule === 'ROLE' && (targetRole || targetLevelNumber)) {
    let targetNum = Number(targetLevelNumber);
    if (isNaN(targetNum) && targetRole) {
      const matchNum = String(targetRole).match(/\d+/);
      if (matchNum) targetNum = parseInt(matchNum[0]);
    }

    const isTeamLeadStep = (targetRole && /team lead|tl/i.test(targetRole)) || targetNum === 7 || targetNum === 8 || (step.stepName && /team lead|tl/i.test(step.stepName));

    const compFilter = (requester.companyId || requester.company)
      ? { $or: [{ companyId: requester.companyId || requester.company }, { company: requester.companyId || requester.company }] }
      : {};

    if (isTeamLeadStep && requester.department) {
      const deptTLs = await User.find({
        ...compFilter,
        department: requester.department,
        $or: [
          { role: 'team_lead' },
          { roleLevel: { $in: [7, 8] } },
          { roleCode: { $regex: /TL/i } }
        ],
        _id: { $ne: requester._id || requester.id },
        status: 'active'
      }).select('_id name fullName email role department');
      if (deptTLs && deptTLs.length > 0) return deptTLs;
    }

    if (!isNaN(targetNum)) {
      const level = await Level.findOne({ levelNumber: targetNum });
      if (level) {
        return await User.find({ ...compFilter, levelRef: level._id, status: 'active' }).select('_id name fullName email role department');
      }
    }
    return await User.find({ ...compFilter, role: (targetRole || '').toLowerCase(), status: 'active' }).select('_id name fullName email role department');
  }

  return await User.find({ role: { $in: ['manager', 'department_admin', 'admin', 'super_admin'] } }).select('_id name email role department').limit(20);
};

/**
 * Generate complete dynamic approval chain for a transaction / request
 */
const evaluateApprovalWorkflow = async (moduleName, payload = {}, requesterInput) => {
  let requester = null;

  if (typeof requesterInput === 'string' || (requesterInput && requesterInput._bsontype)) {
    requester = await User.findById(requesterInput).populate('company levelRef gradeRef');
  } else if (requesterInput && requesterInput._id) {
    requester = await User.findById(requesterInput._id).populate('company levelRef gradeRef');
  } else {
    requester = requesterInput;
  }

  if (!requester) {
    requester = { name: 'Requester Staff', _id: new mongoose.Types.ObjectId() };
  }

  const matchingWorkflow = await findMatchingWorkflow(moduleName, payload, requester);

  if (!matchingWorkflow || !matchingWorkflow.steps || matchingWorkflow.steps.length === 0) {
    const manager = await resolveStepApprover({ approverRule: 'IMMEDIATE_MANAGER' }, requester);
    return {
      workflowName: 'Default Enterprise Workflow',
      steps: [
        {
          stepIndex: 1,
          stepName: 'Approval',
          stepType: 'APPROVAL',
          approverRule: 'IMMEDIATE_MANAGER',
          dispatchMethod: 'HANDLER',
          featureFlags: { assignHandler: true, directDispatch: true },
          approverUser: manager ? manager._id : null,
          approverName: manager ? manager.name : 'Manager',
          status: 'pending',
        },
        {
          stepIndex: 2,
          stepName: 'Store Sourcing & Dispatch',
          stepType: 'DISPATCH',
          approverRule: 'RESPONSIBILITY',
          dispatchMethod: 'HANDLER',
          featureFlags: { assignHandler: true, directDispatch: true },
          status: 'queued',
        },
      ],
    };
  }

  const resolvedSteps = [];
  for (const step of matchingWorkflow.steps) {
    const approver = await resolveStepApprover(step, requester);
    resolvedSteps.push({
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      stepType: step.stepType || 'APPROVAL',
      approverRule: step.approverRule || step.approverType || 'IMMEDIATE_MANAGER',
      approverType: step.approverType || step.approverRule || 'REPORTS_TO',
      dispatchMethod: step.dispatchMethod || 'HANDLER',
      storeType: step.storeType || 'MAIN_WAREHOUSE',
      featureFlags: step.featureFlags || { assignHandler: true, directDispatch: true },
      targetResponsibility: step.targetResponsibility || null,
      approverUser: approver ? approver._id : null,
      approverName: approver ? approver.name : 'System Approver',
      approverEmail: approver ? approver.email : null,
      status: resolvedSteps.length === 0 ? 'pending' : 'queued',
      slaHours: step.slaHours || 24,
    });
  }

  return {
    workflowId: matchingWorkflow._id,
    workflowName: matchingWorkflow.name,
    steps: resolvedSteps,
  };
};

/**
 * Layer 3: Feature Flags & Dynamic Runtime Context Resolver
 * Returns dynamic UI permissions and step parameters based on active Workflow step.
 */
const getWorkflowContext = async (moduleName, transactionPayload = {}, requesterUser = null) => {
  const workflow = await findMatchingWorkflow(moduleName, transactionPayload, requesterUser || {});
  
  // Default features if no workflow configured
  let activeStep = null;
  let features = {
    assignHandler: true,
    directDispatch: true,
    returnRequired: true,
    barcodeSplit: true,
    warrantyExchange: true,
    closeRequest: true,
  };
  let dispatchMethod = 'HANDLER';
  let storeType = 'MAIN_WAREHOUSE';

  if (workflow && workflow.steps && workflow.steps.length > 0) {
    // Find active step based on transaction status if available
    const status = (transactionPayload.status || '').toLowerCase();
    if (status.includes('store') || status.includes('dispatch') || status === 'approved' || status === 'in_transit') {
      activeStep = workflow.steps.find(s => s.stepType === 'DISPATCH' || s.stepType === 'STORE') || workflow.steps[workflow.steps.length - 1];
    } else {
      activeStep = workflow.steps[0];
    }

    if (activeStep) {
      if (activeStep.dispatchMethod) dispatchMethod = activeStep.dispatchMethod;
      if (activeStep.storeType) storeType = activeStep.storeType;
      if (activeStep.featureFlags) {
        features = { ...features, ...activeStep.featureFlags };
      }
    }
  }

  // Force assignHandler to false if dispatchMethod is DIRECT
  if (dispatchMethod === 'DIRECT') {
    features.assignHandler = false;
  }

  const allRawSteps = (workflow && workflow.steps && workflow.steps.length > 0)
    ? workflow.steps
    : [
        {
          stepIndex: 1,
          stepName: 'Approval Step 1',
          stepType: 'APPROVAL',
          approverRule: 'IMMEDIATE_MANAGER',
        }
      ];

  const approvalSteps = [];
  const rawApprovalFiltered = allRawSteps.filter(st => st.stepType === 'APPROVAL' || !st.stepType || ['STORE', 'SPLIT', 'EXCHANGE', 'MERGE'].includes(st.stepType));
  for (const s of rawApprovalFiltered) {
    const candidates = await getCandidateApprovers(s, requesterUser || {});
    approvalSteps.push({
      stepIndex: s.stepIndex,
      stepName: s.stepName || `Approval Step ${s.stepIndex}`,
      stepType: s.stepType || 'APPROVAL',
      approverRule: s.approverRule || s.approverType || 'IMMEDIATE_MANAGER',
      targetCategory: s.targetCategory || null,
      targetRole: s.targetRole || null,
      targetLevelNumber: s.targetLevelNumber || null,
      targetUser: s.targetUser || null,
      candidates: candidates.map(c => ({
        id: c._id ? c._id.toString() : c.id,
        name: c.name || c.fullName,
        label: `${c.name || c.fullName} (${c.role || 'Approver'})`,
        role: c.role,
        department: c.department
      }))
    });
  }

  return {
    workflowId: workflow ? workflow._id : null,
    workflowName: workflow ? workflow.name : 'Standard Default Workflow',
    activeStep: activeStep ? {
      stepIndex: activeStep.stepIndex,
      stepName: activeStep.stepName,
      stepType: activeStep.stepType,
      approverRule: activeStep.approverRule,
    } : null,
    approvalSteps,
    dispatchMethod,
    storeType,
    featureFlags: features,
    uiPermissions: {
      showAssignHandler: features.assignHandler === true && dispatchMethod !== 'DIRECT',
      showDirectDispatch: features.directDispatch === true || dispatchMethod === 'DIRECT',
      showReturnButton: features.returnRequired === true,
      showBarcodeSplit: features.barcodeSplit === true,
      showWarrantyExchange: features.warrantyExchange === true,
      showCloseRequest: features.closeRequest === true,
    },
  };
};

/**
 * Evaluate whether a given user has the authority to approve / perform a specific workflow step
 */
const canUserPerformWorkflowStep = (user, step, requester = {}) => {
  if (!user) return false;
  const userRole = (user.role || '').toLowerCase();
  const userRoleCode = (user.roleCode || '').toUpperCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user.scope === 'GLOBAL';
  if (isSuperAdmin) return true; // Super Admin has global override permission

  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'companyadmin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = userRole === 'hr' || userRole === 'hr_admin' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || userRoleCode === 'HR_ADMIN';
  const isStoreAdmin = userRole === 'store' || userRole === 'store_admin' || userRole === 'store_manager' || userRoleCode === 'TCSTR1';
  const isAccountAdmin = userRole === 'accounts' || userRole === 'account_admin' || userRole === 'finance' || userRoleCode === 'TCACC1' || userRoleCode === 'ACCOUNT_ADMIN';

  const approverRule = step.approverRule || step.approverType;

  if (approverRule === 'STORE_ADMIN') {
    return isStoreAdmin || isCompanyAdmin;
  }
  if (approverRule === 'ACCOUNT_ADMIN') {
    return isAccountAdmin || isCompanyAdmin;
  }
  if (approverRule === 'HR_ADMIN') {
    return isHRAdmin || isCompanyAdmin;
  }
  if (approverRule === 'COMPANY_ADMIN') {
    return isCompanyAdmin;
  }
  if (approverRule === 'SUPER_ADMIN') {
    return isSuperAdmin;
  }
  if (approverRule === 'REQUESTER') {
    return requester && String(requester._id || requester.id) === String(user._id || user.id);
  }
  if (approverRule === 'SPECIFIC_USER' || approverRule === 'EMPLOYEE') {
    return step.targetUser && String(step.targetUser) === String(user._id || user.id);
  }
  if (approverRule === 'IMMEDIATE_MANAGER' || approverRule === 'REPORTS_TO') {
    if (requester && (String(requester.reportsTo) === String(user._id || user.id) || String(requester.approver) === String(user._id || user.id))) {
      return true;
    }
    return isCompanyAdmin || isHRAdmin;
  }

  return isCompanyAdmin;
};

module.exports = {
  matchesCondition,
  findMatchingWorkflow,
  resolveStepApprover,
  evaluateApprovalWorkflow,
  getWorkflowContext,
  getCandidateApprovers,
  canUserPerformWorkflowStep,
};
