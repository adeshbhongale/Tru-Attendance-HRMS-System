const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const RoleTemplate = require('../models/RoleTemplate');
const Responsibility = require('../models/Responsibility');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const RolePermission = require('../models/RolePermission');
const User = require('../models/User');
const workflowEngine = require('../services/workflowEngine');
const { generateRoleCode, syncLevelsFromDB } = require('../middleware/rbac');

// --- COMPANY CONTROLLERS ---
exports.getCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
    res.status(200).json({ success: true, count: companies.length, data: companies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCompany = async (req, res) => {
  try {
    const company = await Company.create(req.body);
    res.status(201).json({ success: true, data: company });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    res.status(200).json({ success: true, data: company });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- LEVEL CONTROLLERS ---
exports.getLevels = async (req, res) => {
  try {
    const levels = await Level.find().sort({ levelNumber: 1 });
    res.status(200).json({ success: true, count: levels.length, data: levels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLevel = async (req, res) => {
  try {
    // If no levelNumber provided, auto-assign as next number
    if (!req.body.levelNumber) {
      const maxLevel = await Level.findOne().sort({ levelNumber: -1 }).select('levelNumber');
      req.body.levelNumber = (maxLevel?.levelNumber || 0) + 1;
    }

    // Auto-set categoryPrefix and usesDepartmentPrefix based on category
    const category = req.body.category;
    if (category === 'DIRECTOR') {
      req.body.categoryPrefix = 'DI';
      req.body.usesDepartmentPrefix = false;
    } else if (category === 'MANAGEMENT') {
      req.body.categoryPrefix = 'MN';
      req.body.usesDepartmentPrefix = false;
    } else if (category === 'LEADERSHIP') {
      req.body.categoryPrefix = 'LD';
      req.body.usesDepartmentPrefix = false;
    } else {
      // STAFF, TRAINEE
      req.body.categoryPrefix = null;
      req.body.usesDepartmentPrefix = true;
    }

    const level = await Level.create(req.body);

    // Sync the in-memory cache
    await syncLevelsFromDB();

    res.status(201).json({ success: true, data: level });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateLevel = async (req, res) => {
  try {
    // Auto-set categoryPrefix and usesDepartmentPrefix if category changed
    if (req.body.category) {
      const category = req.body.category;
      if (category === 'DIRECTOR') {
        req.body.categoryPrefix = 'DI';
        req.body.usesDepartmentPrefix = false;
      } else if (category === 'MANAGEMENT') {
        req.body.categoryPrefix = 'MN';
        req.body.usesDepartmentPrefix = false;
      } else if (category === 'LEADERSHIP') {
        req.body.categoryPrefix = 'LD';
        req.body.usesDepartmentPrefix = false;
      } else {
        req.body.categoryPrefix = null;
        req.body.usesDepartmentPrefix = true;
      }
    }

    // Prevent duplicate key error on levelNumber during basic edit
    delete req.body.levelNumber;

    const level = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!level) return res.status(404).json({ success: false, message: 'Level not found' });

    // Sync the in-memory cache
    await syncLevelsFromDB();

    res.status(200).json({ success: true, data: level });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteLevel = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ success: false, message: 'Level not found' });
    await level.deleteOne();
    await syncLevelsFromDB();
    res.status(200).json({ success: true, message: 'Level deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Reorder levels — auto-reassigns levelNumber 1, 2, 3...N based on the
 * ordered array of Level _ids sent by the admin (drag-and-drop or move up/down).
 * Uses two-phase update to avoid unique index duplicate key collision.
 */
exports.reorderLevels = async (req, res) => {
  try {
    const { orderedLevelIds } = req.body;

    if (!Array.isArray(orderedLevelIds) || orderedLevelIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedLevelIds array is required' });
    }

    // Step 1: Temporarily set levelNumbers to negative values to prevent unique constraint conflict
    const tempOps = orderedLevelIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { levelNumber: -(index + 1000) },
      }
    }));

    await Level.bulkWrite(tempOps);

    // Step 2: Assign final sequential levelNumbers (1..N)
    const finalOps = orderedLevelIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { levelNumber: index + 1 },
      }
    }));

    await Level.bulkWrite(finalOps);

    // Sync in-memory cache
    await syncLevelsFromDB();

    // Regenerate roleCodes for all users that have a levelRef
    const levels = await Level.find({ status: 'active' }).lean();
    const levelMap = {};
    levels.forEach(l => { levelMap[l._id.toString()] = l; });

    const usersWithLevel = await User.find({ levelRef: { $ne: null } }).populate('gradeRef');
    const CompanySetting = require('../models/CompanySetting');
    const settings = await CompanySetting.findOne();
    const orgCode = settings?.orgCode || 'TC';

    const userBulkOps = [];
    for (const user of usersWithLevel) {
      const levelDoc = levelMap[user.levelRef.toString()];
      if (!levelDoc) continue;

      const gradeCode = user.gradeRef?.code || user.roleGrade || 'a';

      let deptPrefix = null;
      if (user.department) {
        const dept = await Department.findOne({ name: user.department });
        deptPrefix = dept?.prefix || null;
      }

      const newRoleCode = await generateRoleCode(orgCode, levelDoc, gradeCode, deptPrefix);

      userBulkOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            roleLevel: levelDoc.levelNumber,
            roleCode: newRoleCode,
          }
        }
      });
    }

    if (userBulkOps.length > 0) {
      await User.bulkWrite(userBulkOps);
    }

    const updatedLevels = await Level.find().sort({ levelNumber: 1 });
    res.status(200).json({
      success: true,
      message: `Reordered ${orderedLevelIds.length} levels and updated ${userBulkOps.length} user roleCodes`,
      data: updatedLevels,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- GRADE CONTROLLERS ---
exports.getGrades = async (req, res) => {
  try {
    const grades = await Grade.find().sort({ order: 1, gradeOrder: 1, code: 1 });
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createGrade = async (req, res) => {
  try {
    if (req.body.order !== undefined) {
      req.body.gradeOrder = req.body.order;
    }
    const grade = await Grade.create(req.body);
    res.status(201).json({ success: true, data: grade });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    if (req.body.order !== undefined) {
      req.body.gradeOrder = req.body.order;
    }
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    res.status(200).json({ success: true, data: grade });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const grade = await Grade.findByIdAndDelete(req.params.id);
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- DYNAMIC ROLE GENERATOR & TEMPLATES ---
exports.getRoleTemplates = async (req, res) => {
  try {
    const templates = await RoleTemplate.find().populate('department level grade').sort({ roleCode: 1 });
    res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRoleTemplate = async (req, res) => {
  try {
    const { departmentId, levelId, gradeId, roleName, description } = req.body;
    const dept = await Department.findById(departmentId);
    const lvl = await Level.findById(levelId);
    const grd = await Grade.findById(gradeId);

    if (!lvl || !grd) {
      return res.status(400).json({ success: false, message: 'Level and Grade must be valid' });
    }

    // Department is optional for DIRECTOR/MANAGEMENT/LEADERSHIP categories
    if (lvl.usesDepartmentPrefix && !dept) {
      return res.status(400).json({ success: false, message: 'Department is required for STAFF/TRAINEE level roles' });
    }

    const CompanySetting = require('../models/CompanySetting');
    const settings = await CompanySetting.findOne();
    const orgCode = settings?.orgCode || 'TC';

    const deptPrefix = dept?.prefix || null;
    const roleCode = await generateRoleCode(orgCode, lvl, grd.code, deptPrefix);

    const template = await RoleTemplate.create({
      department: departmentId || null,
      level: levelId,
      grade: gradeId,
      roleCode,
      roleName: roleName || `${dept ? dept.name + ' ' : ''}${lvl.name} ${grd.name}`,
      description,
    });

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- RESPONSIBILITIES CONTROLLERS ---
exports.getResponsibilities = async (req, res) => {
  try {
    const responsibilities = await Responsibility.find().populate('assignedEmployees', 'name email roleCode department');
    res.status(200).json({ success: true, count: responsibilities.length, data: responsibilities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createResponsibility = async (req, res) => {
  try {
    const resp = await Responsibility.create(req.body);
    res.status(201).json({ success: true, data: resp });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.assignEmployeesToResponsibility = async (req, res) => {
  try {
    const { responsibilityId, employeeIds } = req.body;
    const resp = await Responsibility.findByIdAndUpdate(
      responsibilityId,
      { assignedEmployees: employeeIds },
      { new: true }
    ).populate('assignedEmployees', 'name email roleCode department');

    // Also update responsibilityCodes array on target User models
    await User.updateMany(
      { _id: { $in: employeeIds } },
      { $addToSet: { responsibilityCodes: resp.code, responsibilities: resp._id } }
    );

    res.status(200).json({ success: true, data: resp });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- APPROVAL WORKFLOW CONTROLLERS ---
exports.getWorkflows = async (req, res) => {
  try {
    const workflows = await ApprovalWorkflow.find()
      .populate('company department steps.targetUser steps.targetDepartment')
      .sort({ module: 1, priorityOrder: 1 });
    res.status(200).json({ success: true, count: workflows.length, data: workflows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createWorkflow = async (req, res) => {
  try {
    const workflow = await ApprovalWorkflow.create(req.body);
    res.status(201).json({ success: true, data: workflow });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateWorkflow = async (req, res) => {
  try {
    const workflow = await ApprovalWorkflow.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    res.status(200).json({ success: true, data: workflow });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.testEvaluateWorkflow = async (req, res) => {
  try {
    const { module, payload, requesterId } = req.body;
    const requester = await User.findById(requesterId);
    if (!requester) return res.status(404).json({ success: false, message: 'Requester not found' });

    const evaluation = await workflowEngine.evaluateApprovalWorkflow(module, payload || {}, requester);
    res.status(200).json({ success: true, data: evaluation });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- REPORTING HIERARCHY CONTROLLERS ---
exports.getReportingHierarchy = async (req, res) => {
  try {
    const employees = await User.find({ status: 'active' })
      .select('name email role roleCode department designation reportsTo approver levelRef gradeRef dataScope')
      .populate('reportsTo', 'name email roleCode')
      .populate('approver', 'name email roleCode')
      .populate('levelRef gradeRef');
    res.status(200).json({ success: true, count: employees.length, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateEmployeeReporting = async (req, res) => {
  try {
    const { employeeId, reportsToId, approverId, levelRefId, gradeRefId, dataScope } = req.body;
    const updateData = {};
    if (reportsToId !== undefined) updateData.reportsTo = reportsToId || null;
    if (approverId !== undefined) updateData.approver = approverId || null;
    if (levelRefId !== undefined) updateData.levelRef = levelRefId || null;
    if (gradeRefId !== undefined) updateData.gradeRef = gradeRefId || null;
    if (dataScope) updateData.dataScope = dataScope;

    // Auto-regenerate roleCode if levelRef or gradeRef changed
    if (levelRefId || gradeRefId) {
      const currentUser = await User.findById(employeeId);
      const newLevelId = levelRefId || currentUser?.levelRef;
      const newGradeId = gradeRefId || currentUser?.gradeRef;

      if (newLevelId && newGradeId) {
        const levelDoc = await Level.findById(newLevelId).lean();
        const gradeDoc = await Grade.findById(newGradeId).lean();
        if (levelDoc && gradeDoc) {
          const CompanySetting = require('../models/CompanySetting');
          const settings = await CompanySetting.findOne();
          const orgCode = settings?.orgCode || 'TC';

          let deptPrefix = null;
          if (currentUser?.department) {
            const dept = await Department.findOne({ name: currentUser.department });
            deptPrefix = dept?.prefix || null;
          }

          updateData.roleCode = await generateRoleCode(orgCode, levelDoc, gradeDoc.code, deptPrefix);
          updateData.roleLevel = levelDoc.levelNumber;
          updateData.roleGrade = gradeDoc.code;
        }
      }
    }

    const user = await User.findByIdAndUpdate(employeeId, updateData, { new: true })
      .populate('reportsTo approver levelRef gradeRef');
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- PARENT-CHILD HIERARCHY RULES ---
exports.getParentChildRules = async (req, res) => {
  try {
    const ParentChildRule = require('../models/ParentChildRule');
    const rules = await ParentChildRule.find()
      .populate('parentLevel', 'name levelNumber category categoryPrefix')
      .populate('allowedChildLevels', 'name levelNumber category categoryPrefix')
      .sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: rules.length, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.upsertParentChildRule = async (req, res) => {
  try {
    const ParentChildRule = require('../models/ParentChildRule');
    const { parentLevelId, allowedChildLevelIds, maxDirectReports, minDirectReports, canManageMultipleDepartments, canManageCrossDepartment, approvalLevel, autoAssignNewEmployees } = req.body;

    if (!parentLevelId) {
      return res.status(400).json({ success: false, message: 'parentLevelId is required' });
    }

    const updateData = {
      parentLevel: parentLevelId,
      allowedChildLevels: allowedChildLevelIds || [],
      maxDirectReports: maxDirectReports !== undefined ? maxDirectReports : 15,
      minDirectReports: minDirectReports !== undefined ? minDirectReports : 1,
      canManageMultipleDepartments: canManageMultipleDepartments !== undefined ? canManageMultipleDepartments : true,
      canManageCrossDepartment: canManageCrossDepartment !== undefined ? canManageCrossDepartment : true,
      approvalLevel: approvalLevel !== undefined ? approvalLevel : 1,
      autoAssignNewEmployees: autoAssignNewEmployees !== undefined ? autoAssignNewEmployees : false,
    };

    const rule = await ParentChildRule.findOneAndUpdate(
      { parentLevel: parentLevelId },
      updateData,
      { new: true, upsert: true, runValidators: true }
    )
    .populate('parentLevel', 'name levelNumber category categoryPrefix')
    .populate('allowedChildLevels', 'name levelNumber category categoryPrefix');

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteParentChildRule = async (req, res) => {
  try {
    const ParentChildRule = require('../models/ParentChildRule');
    const rule = await ParentChildRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.status(200).json({ success: true, message: 'Rule deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- DYNAMIC SUBORDINATE SELECTOR FOR PARENT ---
exports.getSelectableSubordinatesForParent = async (req, res) => {
  try {
    const ParentChildRule = require('../models/ParentChildRule');
    const { parentUserId, parentLevelId } = req.query;

    let parentUser = null;
    let targetLevelId = parentLevelId;

    if (parentUserId) {
      parentUser = await User.findById(parentUserId).populate('levelRef');
      if (parentUser && parentUser.levelRef) {
        targetLevelId = parentUser.levelRef._id;
      }
    }

    let allowedChildLevelIds = [];
    let rule = null;

    if (targetLevelId) {
      rule = await ParentChildRule.findOne({ parentLevel: targetLevelId })
        .populate('allowedChildLevels', 'name levelNumber category categoryPrefix');
      if (rule && rule.allowedChildLevels) {
        allowedChildLevelIds = rule.allowedChildLevels.map(l => l._id);
      }
    }

    // Fallback: If no explicit rule set, get all levels with levelNumber > parentLevelNumber
    if (allowedChildLevelIds.length === 0) {
      let parentLevelNum = 1;
      if (parentUser && parentUser.levelRef) {
        parentLevelNum = parentUser.levelRef.levelNumber;
      } else if (targetLevelId) {
        const lvl = await Level.findById(targetLevelId);
        if (lvl) parentLevelNum = lvl.levelNumber;
      }

      const childLevels = await Level.find({
        levelNumber: { $gt: parentLevelNum },
        status: 'active'
      }).select('_id');
      allowedChildLevelIds = childLevels.map(l => l._id);
    }

    // Build user filter query
    const userQuery = {
      status: 'active',
      levelRef: { $in: allowedChildLevelIds },
    };

    // Exclude parent user self
    if (parentUserId) {
      userQuery._id = { $ne: parentUserId };
    }

    const availableEmployees = await User.find(userQuery)
      .select('name email mobile department designation roleCode levelRef gradeRef reportsTo profileImage status')
      .populate('levelRef', 'name levelNumber category categoryPrefix')
      .populate('gradeRef', 'code gradeLabel')
      .populate('reportsTo', 'name email roleCode')
      .sort({ department: 1, name: 1 })
      .lean();

    // Group employees by Level / Role
    const groupedByLevel = {};
    availableEmployees.forEach(emp => {
      const levelName = emp.levelRef ? emp.levelRef.name : 'Other Staff';
      const levelId = emp.levelRef ? emp.levelRef._id.toString() : 'other';
      if (!groupedByLevel[levelId]) {
        groupedByLevel[levelId] = {
          levelId,
          levelName,
          levelNumber: emp.levelRef ? emp.levelRef.levelNumber : 99,
          category: emp.levelRef ? emp.levelRef.category : 'STAFF',
          totalCount: 0,
          currentlyAssignedCount: 0,
          employees: [],
        };
      }

      const isCurrentlyAssignedToThisParent = parentUserId && emp.reportsTo && emp.reportsTo._id.toString() === parentUserId.toString();
      if (isCurrentlyAssignedToThisParent) {
        groupedByLevel[levelId].currentlyAssignedCount++;
      }

      groupedByLevel[levelId].totalCount++;
      groupedByLevel[levelId].employees.push({
        ...emp,
        isAssignedToParent: isCurrentlyAssignedToThisParent,
      });
    });

    const groupsArray = Object.values(groupedByLevel).sort((a, b) => a.levelNumber - b.levelNumber);

    res.status(200).json({
      success: true,
      parentUser: parentUser ? {
        _id: parentUser._id,
        name: parentUser.name,
        roleCode: parentUser.roleCode,
        department: parentUser.department,
        designation: parentUser.designation,
        levelName: parentUser.levelRef?.name,
      } : null,
      rule: rule || null,
      totalSelectable: availableEmployees.length,
      groupedByLevel: groupsArray,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- BULK SUBORDINATE ASSIGNMENT ---
exports.assignSubordinates = async (req, res) => {
  try {
    const { parentUserId, subordinateUserIds, unassignUserIds } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ success: false, message: 'parentUserId is required' });
    }

    const parentUser = await User.findById(parentUserId).populate('levelRef');
    if (!parentUser) {
      return res.status(404).json({ success: false, message: 'Parent manager employee not found' });
    }

    let assignedCount = 0;
    let unassignedCount = 0;

    // Assign subordinates
    if (Array.isArray(subordinateUserIds) && subordinateUserIds.length > 0) {
      const result = await User.updateMany(
        { _id: { $in: subordinateUserIds } },
        { $set: { reportsTo: parentUserId, approver: parentUserId } }
      );
      assignedCount = result.modifiedCount;
    }

    // Unassign subordinates if requested
    if (Array.isArray(unassignUserIds) && unassignUserIds.length > 0) {
      const result = await User.updateMany(
        { _id: { $in: unassignUserIds }, reportsTo: parentUserId },
        { $set: { reportsTo: null } }
      );
      unassignedCount = result.modifiedCount;
    }

    // Fetch updated direct reports count
    const totalDirectReports = await User.countDocuments({ reportsTo: parentUserId, status: 'active' });

    res.status(200).json({
      success: true,
      message: `Successfully assigned ${assignedCount} and unassigned ${unassignedCount} subordinates`,
      parentManager: {
        _id: parentUser._id,
        name: parentUser.name,
        roleCode: parentUser.roleCode,
        totalDirectReports,
      },
      assignedCount,
      unassignedCount,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- ENTERPRISE ORG CHART TREE GENERATOR ---
exports.getOrgChartTree = async (req, res) => {
  try {
    const { department, search, maxDepth } = req.query;

    const query = { status: 'active' };
    if (department && department !== 'all') {
      query.department = department;
    }

    const employees = await User.find(query)
      .select('name email mobile department designation roleCode levelRef gradeRef reportsTo profileImage status branch dataScope')
      .populate('levelRef', 'name levelNumber category categoryPrefix defaultDataScope')
      .populate('gradeRef', 'code gradeLabel')
      .populate('reportsTo', 'name email roleCode')
      .lean();

    // Map employees by _id
    const empMap = {};
    employees.forEach(emp => {
      empMap[emp._id.toString()] = {
        id: emp._id.toString(),
        name: emp.name,
        email: emp.email,
        mobile: emp.mobile,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        roleCode: emp.roleCode || 'N/A',
        levelNumber: emp.levelRef ? emp.levelRef.levelNumber : (emp.roleLevel ? Number(emp.roleLevel) : 11),
        levelName: emp.levelRef ? emp.levelRef.name : (Number(emp.roleLevel) === 7 ? 'Team Lead' : Number(emp.roleLevel) === 11 ? 'Team Member' : Number(emp.roleLevel) === 13 ? 'Trainee' : 'Staff'),
        category: emp.levelRef ? emp.levelRef.category : (Number(emp.roleLevel) <= 4 ? 'MANAGEMENT' : Number(emp.roleLevel) <= 7 ? 'LEADERSHIP' : 'STAFF'),
        gradeCode: emp.gradeRef ? emp.gradeRef.code : 'a',
        profileImage: emp.profileImage || null,
        status: emp.status,
        branch: emp.branch || '',
        reportsToId: emp.reportsTo ? emp.reportsTo._id.toString() : null,
        reportsToName: emp.reportsTo ? emp.reportsTo.name : null,
        children: [],
        directReportCount: 0,
      };
    });

    // Helper to check if targetId is an ancestor of currentId
    const isAncestor = (targetId, currentId) => {
      let curr = empMap[currentId];
      const visited = new Set();
      while (curr && curr.reportsToId) {
        if (visited.has(curr.id)) break;
        visited.add(curr.id);
        if (curr.reportsToId === targetId) return true;
        curr = empMap[curr.reportsToId];
      }
      return false;
    };

    // Build parent-child links safely without circular reference cycles
    const rootNodes = [];
    Object.values(empMap).forEach(node => {
      if (
        node.reportsToId && 
        empMap[node.reportsToId] && 
        node.reportsToId !== node.id && 
        !isAncestor(node.id, node.reportsToId)
      ) {
        empMap[node.reportsToId].children.push(node);
        empMap[node.reportsToId].directReportCount++;
      } else {
        node.reportsToId = null;
        rootNodes.push(node);
      }
    });

    // Sort root nodes by levelNumber ASC (top leadership first)
    rootNodes.sort((a, b) => a.levelNumber - b.levelNumber);

    // Calculate depth and total descendants per node recursively
    const computeStats = (node, depth = 1) => {
      node.depth = depth;
      let totalDescendants = node.children.length;
      node.children.sort((a, b) => a.levelNumber - b.levelNumber);
      node.children.forEach(child => {
        totalDescendants += computeStats(child, depth + 1);
      });
      node.totalDescendants = totalDescendants;
      return totalDescendants;
    };

    rootNodes.forEach(root => computeStats(root, 1));

    // Summary metrics
    const totalEmployees = employees.length;
    const totalDepartments = [...new Set(employees.map(e => e.department).filter(Boolean))].length;
    const totalManagers = Object.values(empMap).filter(e => e.directReportCount > 0).length;

    res.status(200).json({
      success: true,
      metrics: {
        totalEmployees,
        totalDepartments,
        totalManagers,
        totalRoots: rootNodes.length,
      },
      roots: rootNodes,
      flatNodes: Object.values(empMap),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

