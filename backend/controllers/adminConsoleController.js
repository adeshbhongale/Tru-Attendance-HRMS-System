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
const { generateRoleCode } = require('../middleware/rbac');

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
    const levels = await Level.find().sort({ priority: -1 });
    res.status(200).json({ success: true, count: levels.length, data: levels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLevel = async (req, res) => {
  try {
    const level = await Level.create(req.body);
    res.status(201).json({ success: true, data: level });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateLevel = async (req, res) => {
  try {
    const level = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!level) return res.status(404).json({ success: false, message: 'Level not found' });
    res.status(200).json({ success: true, data: level });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- GRADE CONTROLLERS ---
exports.getGrades = async (req, res) => {
  try {
    const grades = await Grade.find().sort({ order: 1 });
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createGrade = async (req, res) => {
  try {
    const grade = await Grade.create(req.body);
    res.status(201).json({ success: true, data: grade });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    res.status(200).json({ success: true, data: grade });
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

    if (!dept || !lvl || !grd) {
      return res.status(400).json({ success: false, message: 'Department, Level, and Grade must be valid' });
    }

    const roleCode = generateRoleCode('TC', dept.prefix, lvl.priority, grd.code);

    const template = await RoleTemplate.create({
      department: departmentId,
      level: levelId,
      grade: gradeId,
      roleCode,
      roleName: roleName || `${dept.name} ${lvl.name} ${grd.name}`,
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

    const user = await User.findByIdAndUpdate(employeeId, updateData, { new: true })
      .populate('reportsTo approver levelRef gradeRef');
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
