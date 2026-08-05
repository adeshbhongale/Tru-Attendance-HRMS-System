const mongoose = require('mongoose');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const User = require('../models/User');
const Level = require('../models/Level');
const Responsibility = require('../models/Responsibility');

/**
 * Evaluate condition rules against payload
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
 * Find highest priority matching workflow for module & payload
 */
const findMatchingWorkflow = async (moduleName, payload, requester) => {
  const query = {
    module: moduleName,
    status: 'active',
  };

  const workflows = await ApprovalWorkflow.find(query).sort({ priorityOrder: 1 }).lean();

  for (const wf of workflows) {
    // Check company filter
    if (wf.company && requester.company && getObjIdStr(wf.company) !== getObjIdStr(requester.company)) {
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

  return null;
};

/**
 * Resolve approver user for a single workflow step.
 * Uses levelNumber (lower = higher authority) instead of priority scores.
 */
const resolveStepApprover = async (step, requester) => {
  const { approverType, targetLevelNumber, targetCategory, targetRole, targetResponsibility, targetUser, targetDepartment } = step;

  if (approverType === 'SPECIFIC_USER' && targetUser) {
    return await User.findById(targetUser).select('_id name email role roleCode department');
  }

  if (approverType === 'REPORTS_TO') {
    if (requester.reportsTo) {
      const manager = await User.findById(requester.reportsTo).select('_id name email role roleCode department');
      if (manager) return manager;
    }
    if (requester.approver) {
      const app = await User.findById(requester.approver).select('_id name email role roleCode department');
      if (app) return app;
    }
    // Fallback to department lead/head
    const deptHead = await User.findOne({
      department: requester.department,
      role: { $in: ['department_admin', 'admin', 'super_admin'] },
      _id: { $ne: requester._id },
    }).select('_id name email role roleCode department');
    if (deptHead) return deptHead;
  }

  if (approverType === 'DEPARTMENT_HEAD') {
    const deptToSearch = targetDepartment ? (await mongoose.model('Department').findById(targetDepartment))?.name : requester.department;
    const deptHead = await User.findOne({
      department: deptToSearch,
      role: { $in: ['department_admin', 'admin', 'super_admin'] },
    }).select('_id name email role roleCode department');
    if (deptHead) return deptHead;
  }

  if (approverType === 'RESPONSIBILITY' && targetResponsibility) {
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
    // Also check responsibilityCodes array on User model
    const userWithResp = await User.findOne({
      responsibilityCodes: targetResponsibility.toUpperCase(),
      _id: { $ne: requester._id },
    }).select('_id name email role roleCode department');
    if (userWithResp) return userWithResp;
  }

  if (approverType === 'LEVEL' && targetLevelNumber) {
    // Find matching level by levelNumber (lower = higher authority)
    const targetLevel = await Level.findOne({ levelNumber: targetLevelNumber, status: 'active' });
    if (targetLevel) {
      const userAtLevel = await User.findOne({
        levelRef: targetLevel._id,
        _id: { $ne: requester._id },
      }).select('_id name email role roleCode department');
      if (userAtLevel) return userAtLevel;
    }

    // Traverse reportsTo chain to find someone at or above the target level
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

    // Fallback: find any user at or above target level
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

    // Last resort fallback
    const adminUser = await User.findOne({
      role: { $in: ['super_admin', 'company_admin'] },
    }).select('_id name email role roleCode department');
    if (adminUser) return adminUser;
  }

  // General fallback: Super Admin or Company Admin
  const defaultAdmin = await User.findOne({ role: { $in: ['super_admin', 'company_admin', 'admin'] } }).select('_id name email role roleCode department');
  return defaultAdmin;
};

/**
 * Generate complete dynamic approval chain for a transaction / request
 */
const evaluateApprovalWorkflow = async (moduleName, payload, requesterInput) => {
  let requester = null;

  if (typeof requesterInput === 'string' || (requesterInput && requesterInput._bsontype)) {
    requester = await User.findById(requesterInput).populate('company levelRef gradeRef');
  } else if (requesterInput && requesterInput._id) {
    requester = await User.findById(requesterInput._id).populate('company levelRef gradeRef');
  } else {
    requester = requesterInput;
  }

  if (!requester) {
    throw new Error('Requester user not found');
  }

  const matchingWorkflow = await findMatchingWorkflow(moduleName, payload, requester);

  if (!matchingWorkflow || !matchingWorkflow.steps || matchingWorkflow.steps.length === 0) {
    // Default fallback 2-step workflow (Manager -> Dept Head)
    const manager = await resolveStepApprover({ approverType: 'REPORTS_TO' }, requester);
    return {
      workflowName: 'Default Standard Approval Chain',
      steps: [
        {
          stepIndex: 1,
          stepName: 'Immediate Manager Approval',
          approverType: 'REPORTS_TO',
          approverUser: manager ? manager._id : null,
          approverName: manager ? manager.name : 'Manager',
          status: 'pending',
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
      approverType: step.approverType,
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

module.exports = {
  findMatchingWorkflow,
  resolveStepApprover,
  evaluateApprovalWorkflow,
};
