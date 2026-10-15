const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const RoleTemplate = require('../models/RoleTemplate');
const Responsibility = require('../models/Responsibility');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const RolePermission = require('../models/RolePermission');
const ExpensePolicy = require('../modules/hr/expense/models/ExpensePolicy');
const User = require('../models/User');
const Shift = require('../models/Shift');
const workflowEngine = require('../services/workflowEngine');
const { generateRoleCode, syncLevelsFromDB } = require('../middleware/rbac');

// Resolve the active tenant company context (set by tenantContext middleware, headers, query, or body)
const resolveTenantCompanyId = (req) => {
  return (
    req.headers['x-company-id'] ||
    req.headers['companyid'] ||
    req.query?.companyId ||
    req.body?.companyId ||
    req.tenant?.companyId ||
    req.user?.companyId ||
    req.user?.company ||
    null
  );
};

// Company-scoped filter for masters carrying legacy `company` + canonical `companyId` fields
const companyScopeFilter = (companyId) => {
  if (companyId) {
    return { $or: [{ companyId }, { company: companyId }] };
  }
  return { companyId: null };
};

// Helper check for superadmin authority
const isSuperAdminUser = (req) => {
  const u = req.user;
  if (!u) return false;
  return u.scope === 'GLOBAL' || u.role === 'superadmin' || u.role === 'super_admin' || u.roleCode === 'TCSA1';
};

// Helper check for admin console management authority (Company Admin & Super Admin)
const canManageAdminConsole = (req) => {
  const u = req.user;
  if (!u) return false;
  const roleLower = (u.role || '').toLowerCase();
  const codeUpper = (u.roleCode || '').toUpperCase();
  return (
    u.scope === 'GLOBAL' ||
    roleLower === 'superadmin' ||
    roleLower === 'super_admin' ||
    codeUpper === 'TCSA1' ||
    roleLower === 'company_admin' ||
    roleLower === 'admin' ||
    codeUpper === 'TCCA1' ||
    roleLower === 'hr_admin'
  );
};

const seedBaselineMastersForCompany = async (companyId, companyCode = 'COMP') => {
  // New companies start completely blank without auto-seeded defaults
  return;
};

// --- COMPANY CONTROLLERS ---
exports.getCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 }).lean();

    // Populate company admin details for each company
    const companyIds = companies.map(c => c._id);
    const companyAdmins = await User.find({
      companyId: { $in: companyIds },
      role: { $in: ['company_admin', 'admin'] }
    }).select('name email mobile employeeIdCode companyId companyCode status').lean();

    const adminMap = {};
    companyAdmins.forEach(adm => {
      if (adm.companyId) {
        adminMap[adm.companyId.toString()] = adm;
      }
    });

    const data = companies.map(comp => ({
      ...comp,
      companyAdmin: adminMap[comp._id.toString()] || null
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCompany = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      branches,
      adminName,
      adminEmail,
      adminMobile,
      adminPassword,
      adminEmployeeIdCode
    } = req.body;

    const trimmedCode = (code || '').trim().toUpperCase();
    if (!trimmedCode) {
      return res.status(400).json({ success: false, message: 'Please provide a unique Company Code (e.g. INFY)' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a Company Name' });
    }

    // Check if company code or name already exists
    const existingCompany = await Company.findOne({
      $or: [{ code: trimmedCode }, { name: name.trim() }]
    });

    if (existingCompany) {
      return res.status(400).json({ success: false, message: `Company with code '${trimmedCode}' or name '${name.trim()}' already exists.` });
    }

    // Create Company Master Record
    const company = await Company.create({
      name: name.trim(),
      code: trimmedCode,
      description: description || `Corporate tenant workspace for ${name.trim()}`,
      branches: branches && branches.length > 0 ? branches : [{ name: 'Headquarters', code: `${trimmedCode}-HQ`, isHeadquarters: true }],
      status: 'active'
    });

    let companyAdmin = null;

    // Create or update dedicated Company Admin user credentials
    if (adminEmail && adminEmail.trim()) {
      const emailLower = adminEmail.trim().toLowerCase();
      let existingUser = await User.findOne({ email: emailLower });

      if (existingUser) {
        existingUser.role = 'company_admin';
        existingUser.roleCode = 'TCCA1';
        existingUser.scope = 'COMPANY';
        existingUser.companyId = company._id;
        existingUser.company = company._id;
        existingUser.companyCode = trimmedCode;
        if (adminPassword) existingUser.password = adminPassword;
        await existingUser.save();
        companyAdmin = existingUser;
      } else {
        companyAdmin = await User.create({
          name: adminName ? adminName.trim() : `${name.trim()} Company Admin`,
          email: emailLower,
          mobile: adminMobile || '9999999999',
          employeeIdCode: adminEmployeeIdCode || `ADM_${trimmedCode}`,
          password: adminPassword || 'Admin@123',
          role: 'company_admin',
          roleCode: 'TCCA1',
          scope: 'COMPANY',
          companyId: company._id,
          company: company._id,
          companyCode: trimmedCode,
          department: 'Management',
          designation: 'Company Admin',
          status: 'ACTIVE',
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Company '${name}' (${trimmedCode}) & Company Admin created successfully!`,
      data: {
        company,
        companyAdmin
      }
    });
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

exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    await company.deleteOne();
    await User.deleteMany({ companyId: req.params.id, role: 'company_admin' });

    res.status(200).json({ success: true, message: `Company '${company.name}' deleted successfully` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- LEVEL CONTROLLERS ---
exports.getLevels = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    if (companyId) {
      await seedBaselineMastersForCompany(companyId);
    }
    const levels = await Level.find(companyScopeFilter(companyId)).sort({ levelNumber: 1 });
    res.status(200).json({ success: true, count: levels.length, data: levels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLevel = async (req, res) => {
  try {
    const compId = resolveTenantCompanyId(req);
    if (compId) {
      req.body.companyId = compId;
      req.body.company = compId;
    }

    // If no levelNumber provided, auto-assign as next number within this company's levels
    if (!req.body.levelNumber) {
      const maxLevel = await Level.findOne(companyScopeFilter(compId)).sort({ levelNumber: -1 }).select('levelNumber');
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
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage level definitions.' });
    }
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

    const level = await Level.findOneAndUpdate(
      { _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) },
      req.body,
      { new: true, runValidators: true }
    );
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
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage level definitions.' });
    }
    const level = await Level.findOneAndDelete({ _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) });
    if (!level) return res.status(404).json({ success: false, message: 'Level not found' });
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
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to reorder level definitions.' });
    }
    const { orderedLevelIds } = req.body;

    if (!Array.isArray(orderedLevelIds) || orderedLevelIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedLevelIds array is required' });
    }

    const companyId = resolveTenantCompanyId(req);
    const scopeFilter = companyScopeFilter(companyId);

    // Step 0: Verify every level being reordered belongs to this admin's company
    const ownedCount = await Level.countDocuments({ _id: { $in: orderedLevelIds }, ...scopeFilter });
    if (ownedCount !== orderedLevelIds.length) {
      return res.status(403).json({ success: false, message: 'Forbidden: one or more levels do not belong to your company.' });
    }

    // Step 1: Temporarily set levelNumbers to negative values to prevent unique constraint conflict
    const tempOps = orderedLevelIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, ...scopeFilter },
        update: { levelNumber: -(index + 1000) },
      }
    }));

    await Level.bulkWrite(tempOps);

    // Step 2: Assign final sequential levelNumbers (1..N)
    const finalOps = orderedLevelIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, ...scopeFilter },
        update: { levelNumber: index + 1 },
      }
    }));

    await Level.bulkWrite(finalOps);

    // Sync in-memory cache
    await syncLevelsFromDB();

    // Regenerate roleCodes for all users that have a levelRef
    const levels = await Level.find({ status: 'active', ...scopeFilter }).lean();
    const levelMap = {};
    levels.forEach(l => { levelMap[l._id.toString()] = l; });

    const usersWithLevel = await User.find({ levelRef: { $ne: null }, ...(companyId ? { companyId } : {}) }).populate('gradeRef');
    const CompanySetting = require('../models/CompanySetting');
    const settings = await CompanySetting.findOne(companyId ? { companyId } : {});
    const orgCode = settings?.orgCode || 'TC';

    const userBulkOps = [];
    for (const user of usersWithLevel) {
      const levelDoc = levelMap[user.levelRef.toString()];
      if (!levelDoc) continue;

      const gradeCode = user.gradeRef?.code || user.roleGrade || 'a';

      let deptPrefix = null;
      if (user.department) {
        const dept = await Department.findOne({ name: user.department, ...scopeFilter });
        deptPrefix = dept?.prefix || null;
      }

      const newRoleCode = await generateRoleCode(orgCode, levelDoc, gradeCode, deptPrefix, companyId);

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

    const updatedLevels = await Level.find(scopeFilter).sort({ levelNumber: 1 });
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
    const companyId = resolveTenantCompanyId(req);
    if (companyId) {
      await seedBaselineMastersForCompany(companyId);
    }
    const grades = await Grade.find(companyScopeFilter(companyId)).sort({ order: 1, gradeOrder: 1, code: 1 });
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createGrade = async (req, res) => {
  try {
    const compId = resolveTenantCompanyId(req);
    if (compId) {
      req.body.companyId = compId;
      req.body.company = compId;
    }
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
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage grade definitions.' });
    }
    if (req.body.order !== undefined) {
      req.body.gradeOrder = req.body.order;
    }
    const grade = await Grade.findOneAndUpdate(
      { _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    res.status(200).json({ success: true, data: grade });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage grade definitions.' });
    }
    const grade = await Grade.findOneAndDelete({ _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- DYNAMIC ROLE GENERATOR & TEMPLATES ---
exports.getRoleTemplates = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    const templates = await RoleTemplate.find(companyId ? { companyId } : {}).populate('department level grade').sort({ roleCode: 1 });
    res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRoleTemplate = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    const { departmentId, levelId, gradeId, roleName, description } = req.body;
    const scopeFilter = companyScopeFilter(companyId);
    const dept = departmentId ? await Department.findOne({ _id: departmentId, ...scopeFilter }) : null;
    const lvl = await Level.findOne({ _id: levelId, ...scopeFilter });
    const grd = await Grade.findOne({ _id: gradeId, ...scopeFilter });

    if (!lvl || !grd) {
      return res.status(400).json({ success: false, message: 'Level and Grade must be valid' });
    }

    // Department is optional for DIRECTOR/MANAGEMENT/LEADERSHIP categories
    if (lvl.usesDepartmentPrefix && !dept) {
      return res.status(400).json({ success: false, message: 'Department is required for STAFF/TRAINEE level roles' });
    }

    const CompanySetting = require('../models/CompanySetting');
    const settings = await CompanySetting.findOne(companyId ? { companyId } : {});
    const orgCode = settings?.orgCode || 'TC';

    const deptPrefix = dept?.prefix || null;
    let roleCode = await generateRoleCode(orgCode, lvl, grd.code, deptPrefix, companyId);

    // Keep roleCode globally unique by appending a numeric suffix if it is already taken by another company's template
    let roleCodeSuffix = '';
    let nextSuffix = 0;
    while (await RoleTemplate.exists({ roleCode: roleCode + roleCodeSuffix })) {
      nextSuffix += 2;
      roleCodeSuffix = `${nextSuffix}`;
    }
    roleCode += roleCodeSuffix;

    const template = await RoleTemplate.create({
      companyId: companyId || null,
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

// --- APPROVAL WORKFLOW CONTROLLERS ---
exports.getWorkflows = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    const scopeFilter = companyScopeFilter(companyId);
    let count = await ApprovalWorkflow.countDocuments(scopeFilter);
    if (count === 0) {
      // Seed default baseline workflow policies for Material, DC, Invoice, Expense, and Leave
      await ApprovalWorkflow.create([
        {
          name: 'Expense Report Standard Policy',
          module: 'Expense',
          company: companyId || null,
          companyId: companyId || null,
          status: 'active',
          priorityOrder: 1,
          conditions: [{ field: 'amount', operator: 'gt', value: 5000 }],
          steps: [
            {
              stepIndex: 1,
              stepName: 'HR Admin Verification & Approval',
              stepType: 'APPROVAL',
              approverRule: 'HR_ADMIN',
              approverType: 'HR_ADMIN',
            },
            {
              stepIndex: 2,
              stepName: 'Account Admin Audit & Payment',
              stepType: 'APPROVAL',
              approverRule: 'ACCOUNT_ADMIN',
              approverType: 'ACCOUNT_ADMIN',
            },
          ],
        },
        {
          name: 'Material Movement Approval Policy',
          module: 'Material',
          company: companyId || null,
          companyId: companyId || null,
          status: 'active',
          priorityOrder: 2,
          conditions: [],
          steps: [
            {
              stepIndex: 1,
              stepName: 'Team Lead Approval',
              stepType: 'APPROVAL',
              approverRule: 'ROLE',
              targetLevelNumber: 7,
              targetRole: 'Level 7: Team Lead (TL)',
            },
            {
              stepIndex: 2,
              stepName: 'Management Approval',
              stepType: 'APPROVAL',
              approverRule: 'MANAGEMENT_CATEGORY',
              targetCategory: 'MANAGEMENT',
            },
            {
              stepIndex: 3,
              stepName: 'Store Dispatch',
              stepType: 'STORE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
              dispatchMethod: 'DIRECT',
              featureFlags: { assignHandler: false, directDispatch: true },
            },
            {
              stepIndex: 4,
              stepName: 'Requester Acceptance',
              stepType: 'RECEIVE',
              approverRule: 'REQUESTER',
              approverType: 'REQUESTER',
            },
            {
              stepIndex: 5,
              stepName: 'Split Request Approval',
              stepType: 'SPLIT',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
            {
              stepIndex: 6,
              stepName: 'Exchange Request Approval',
              stepType: 'EXCHANGE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
            {
              stepIndex: 7,
              stepName: 'Merge Request Approval',
              stepType: 'MERGE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
            {
              stepIndex: 8,
              stepName: 'DC Internal — Team Leader Department Approval',
              stepType: 'APPROVAL',
              approverRule: 'ROLE',
              targetLevelNumber: 7,
              targetRole: 'Level 7: Team Lead (TL)',
            },
            {
              stepIndex: 9,
              stepName: 'DC Internal — Store Physical Verification & Acceptance',
              stepType: 'STORE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
            {
              stepIndex: 10,
              stepName: 'DC FOC — Management Write-Off Authorization',
              stepType: 'APPROVAL',
              approverRule: 'MANAGEMENT_CATEGORY',
              targetCategory: 'MANAGEMENT',
            },
            {
              stepIndex: 11,
              stepName: 'DC FOC — Accounts Admin Audit & Compliance',
              stepType: 'APPROVAL',
              approverRule: 'ACCOUNT_ADMIN',
              approverType: 'ACCOUNT_ADMIN',
            },
            {
              stepIndex: 12,
              stepName: 'DC FOC — Store Physical Verification & Acceptance',
              stepType: 'STORE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
            {
              stepIndex: 13,
              stepName: 'Invoice — Management Commercial Approval',
              stepType: 'APPROVAL',
              approverRule: 'MANAGEMENT_CATEGORY',
              targetCategory: 'MANAGEMENT',
            },
            {
              stepIndex: 14,
              stepName: 'Invoice — Accounts Admin Invoicing & Tax Review',
              stepType: 'APPROVAL',
              approverRule: 'ACCOUNT_ADMIN',
              approverType: 'ACCOUNT_ADMIN',
            },
            {
              stepIndex: 15,
              stepName: 'Invoice — Store Physical Verification & Closure',
              stepType: 'STORE',
              approverRule: 'STORE_ADMIN',
              approverType: 'STORE_ADMIN',
              targetUser: null,
            },
          ],
        },
        {
          name: 'Leave Request Standard Policy',
          module: 'Leave',
          company: companyId || null,
          companyId: companyId || null,
          status: 'active',
          priorityOrder: 3,
          conditions: [{ field: 'days', operator: 'gt', value: 3 }],
          steps: [
            {
              stepIndex: 1,
              stepName: 'Immediate Manager Approval',
              stepType: 'APPROVAL',
              approverRule: 'IMMEDIATE_MANAGER',
              approverType: 'IMMEDIATE_MANAGER',
            },
          ],
        },
      ]);
    }

    // Clean up any standalone DC/Invoice policies so they stay integrated into Material Movement
    await ApprovalWorkflow.deleteMany({
      ...scopeFilter,
      name: { $in: ['DC Internal Delivery Challan Policy', 'DC FOC Delivery Note Policy', 'Invoice Conversion & Billing Policy'] }
    });

    // Ensure all Material Movement workflows in DB have full 15 steps through Merge & DC/Invoice sub-steps
    const existingMaterialWf = await ApprovalWorkflow.findOne({
      ...scopeFilter,
      module: { $in: ['Material', 'Material Movement'] },
      $or: [{ documentType: '' }, { documentType: { $exists: false } }, { documentType: null }]
    });

    if (existingMaterialWf && (existingMaterialWf.steps || []).length < 15) {
      const currentSteps = existingMaterialWf.steps || [];
      const currentIndices = new Set(currentSteps.map(s => s.stepIndex));

      const missingSteps = [
        {
          stepIndex: 8,
          stepName: 'DC Internal — Team Leader Department Approval',
          stepType: 'APPROVAL',
          approverRule: 'ROLE',
          targetLevelNumber: 7,
          targetRole: 'Level 7: Team Lead (TL)',
        },
        {
          stepIndex: 9,
          stepName: 'DC Internal — Store Physical Verification & Acceptance',
          stepType: 'STORE',
          approverRule: 'STORE_ADMIN',
          approverType: 'STORE_ADMIN',
          targetUser: null,
        },
        {
          stepIndex: 10,
          stepName: 'DC FOC — Management Write-Off Authorization',
          stepType: 'APPROVAL',
          approverRule: 'MANAGEMENT_CATEGORY',
          targetCategory: 'MANAGEMENT',
        },
        {
          stepIndex: 11,
          stepName: 'DC FOC — Accounts Admin Audit & Compliance',
          stepType: 'APPROVAL',
          approverRule: 'ACCOUNT_ADMIN',
          approverType: 'ACCOUNT_ADMIN',
        },
        {
          stepIndex: 12,
          stepName: 'DC FOC — Store Physical Verification & Acceptance',
          stepType: 'STORE',
          approverRule: 'STORE_ADMIN',
          approverType: 'STORE_ADMIN',
          targetUser: null,
        },
        {
          stepIndex: 13,
          stepName: 'Invoice — Management Commercial Approval',
          stepType: 'APPROVAL',
          approverRule: 'MANAGEMENT_CATEGORY',
          targetCategory: 'MANAGEMENT',
        },
        {
          stepIndex: 14,
          stepName: 'Invoice — Accounts Admin Invoicing & Tax Review',
          stepType: 'APPROVAL',
          approverRule: 'ACCOUNT_ADMIN',
          approverType: 'ACCOUNT_ADMIN',
        },
        {
          stepIndex: 15,
          stepName: 'Invoice — Store Physical Verification & Closure',
          stepType: 'STORE',
          approverRule: 'STORE_ADMIN',
          approverType: 'STORE_ADMIN',
          targetUser: null,
        },
      ].filter(s => !currentIndices.has(s.stepIndex));

      if (missingSteps.length > 0) {
        existingMaterialWf.steps = [...currentSteps, ...missingSteps];
        await existingMaterialWf.save();
      }
    }

    const workflows = await ApprovalWorkflow.find(scopeFilter)
      .populate('company department steps.targetUser steps.targetDepartment')
      .sort({ priorityOrder: 1, createdAt: 1 });
    res.status(200).json({ success: true, count: workflows.length, data: workflows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createWorkflow = async (req, res) => {
  try {
    const compId = resolveTenantCompanyId(req);
    if (compId) {
      req.body.company = compId;
      req.body.companyId = compId;
    }
    const workflow = await ApprovalWorkflow.create(req.body);

    // Sync ExpensePolicy when an Expense workflow is created
    if (workflow.module && workflow.module.toLowerCase() === 'expense') {
      const hasHrStep = (workflow.steps || []).some(st => 
        (st.approverRule && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverRule.toUpperCase())) ||
        (st.approverType && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverType.toUpperCase()))
      );
      const targetComp = workflow.company || workflow.companyId || compId;
      if (targetComp) {
        await ExpensePolicy.updateMany(
          { companyId: targetComp },
          { approvalRequired: hasHrStep, approvalEngine: hasHrStep ? 'HR' : 'NONE' }
        );
      }
    }

    res.status(201).json({ success: true, data: workflow });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateWorkflow = async (req, res) => {
  try {
    const compId = resolveTenantCompanyId(req);
    const workflow = await ApprovalWorkflow.findOneAndUpdate(
      { _id: req.params.id, ...companyScopeFilter(compId) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });

    // Sync ExpensePolicy when an Expense workflow is updated
    if (workflow.module && workflow.module.toLowerCase() === 'expense') {
      const hasHrStep = (workflow.steps || []).some(st => 
        (st.approverRule && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverRule.toUpperCase())) ||
        (st.approverType && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverType.toUpperCase()))
      );
      const targetComp = workflow.company || workflow.companyId || compId;
      if (targetComp) {
        await ExpensePolicy.updateMany(
          { companyId: targetComp },
          { approvalRequired: hasHrStep, approvalEngine: hasHrStep ? 'HR' : 'NONE' }
        );
      }
    }

    res.status(200).json({ success: true, data: workflow });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const workflow = await ApprovalWorkflow.findOneAndDelete({ _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) });
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.testEvaluateWorkflow = async (req, res) => {
  try {
    const { module, payload, requesterId } = req.body;
    const companyId = resolveTenantCompanyId(req);
    const requester = await User.findOne({ _id: requesterId, ...(companyId ? { companyId } : {}) });
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
    const companyId = resolveTenantCompanyId(req);
    const employees = await User.find({ status: 'active', ...(companyId ? { companyId } : {}) })
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

    const companyId = resolveTenantCompanyId(req);
    const userScope = companyId ? { companyId } : {};
    const scopeFilter = companyScopeFilter(companyId);

    // Auto-regenerate roleCode if levelRef or gradeRef changed
    if (levelRefId || gradeRefId) {
      const currentUser = await User.findOne({ _id: employeeId, ...userScope });
      if (!currentUser) return res.status(404).json({ success: false, message: 'Employee not found' });
      const newLevelId = levelRefId || currentUser?.levelRef;
      const newGradeId = gradeRefId || currentUser?.gradeRef;

      if (newLevelId && newGradeId) {
        const levelDoc = await Level.findOne({ _id: newLevelId, ...scopeFilter }).lean();
        const gradeDoc = await Grade.findOne({ _id: newGradeId, ...scopeFilter }).lean();
        if (levelDoc && gradeDoc) {
          const CompanySetting = require('../models/CompanySetting');
          const settings = await CompanySetting.findOne(companyId ? { companyId } : {});
          const orgCode = settings?.orgCode || 'TC';

          let deptPrefix = null;
          if (currentUser?.department) {
            const dept = await Department.findOne({ name: currentUser.department, ...scopeFilter });
            deptPrefix = dept?.prefix || null;
          }

          updateData.roleCode = await generateRoleCode(orgCode, levelDoc, gradeDoc.code, deptPrefix, companyId);
          updateData.roleLevel = levelDoc.levelNumber;
          updateData.roleGrade = gradeDoc.code;
        }
      }
    }

    const user = await User.findOneAndUpdate({ _id: employeeId, ...userScope }, updateData, { new: true })
      .populate('reportsTo approver levelRef gradeRef');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- PARENT-CHILD HIERARCHY RULES ---
exports.getParentChildRules = async (req, res) => {
  try {
    const ParentChildRule = require('../models/ParentChildRule');
    const companyId = resolveTenantCompanyId(req);
    const rules = await ParentChildRule.find(companyId ? { companyId } : {})
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
    const companyId = resolveTenantCompanyId(req);
    const { parentLevelId, allowedChildLevelIds, maxDirectReports, minDirectReports, canManageMultipleDepartments, canManageCrossDepartment, approvalLevel, autoAssignNewEmployees } = req.body;

    if (!parentLevelId) {
      return res.status(400).json({ success: false, message: 'parentLevelId is required' });
    }

    // Parent level must belong to the admin's company
    const parentLevel = await Level.findOne({ _id: parentLevelId, ...companyScopeFilter(companyId) });
    if (!parentLevel) {
      return res.status(403).json({ success: false, message: 'Forbidden: parent level does not belong to your company.' });
    }

    const updateData = {
      companyId: companyId || null,
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
      { parentLevel: parentLevelId, ...(companyId ? { companyId } : {}) },
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
    const companyId = resolveTenantCompanyId(req);
    const rule = await ParentChildRule.findOneAndDelete({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
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

    const companyId = resolveTenantCompanyId(req);
    const userScope = companyId ? { companyId } : {};
    const scopeFilter = companyScopeFilter(companyId);

    if (parentUserId) {
      parentUser = await User.findOne({ _id: parentUserId, ...userScope }).populate('levelRef');
      if (parentUser && parentUser.levelRef) {
        targetLevelId = parentUser.levelRef._id;
      }
    }

    let allowedChildLevelIds = [];
    let rule = null;

    if (targetLevelId) {
      rule = await ParentChildRule.findOne({ parentLevel: targetLevelId, ...(companyId ? { companyId } : {}) })
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
        const lvl = await Level.findOne({ _id: targetLevelId, ...scopeFilter });
        if (lvl) parentLevelNum = lvl.levelNumber;
      }

      const childLevels = await Level.find({
        levelNumber: { $gt: parentLevelNum },
        status: 'active',
        ...scopeFilter
      }).select('_id');
      allowedChildLevelIds = childLevels.map(l => l._id);
    }

    // Build user filter query
    const userQuery = {
      status: 'active',
      ...userScope,
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

    const parentUser = await User.findOne({ _id: parentUserId, ...(resolveTenantCompanyId(req) ? { companyId: resolveTenantCompanyId(req) } : {}) }).populate('levelRef');
    if (!parentUser) {
      return res.status(404).json({ success: false, message: 'Parent manager employee not found' });
    }

    const companyId = resolveTenantCompanyId(req);
    const userScope = companyId ? { companyId } : {};
    let assignedCount = 0;
    let unassignedCount = 0;

    // Assign subordinates
    if (Array.isArray(subordinateUserIds) && subordinateUserIds.length > 0) {
      const result = await User.updateMany(
        { _id: { $in: subordinateUserIds }, ...userScope },
        { $set: { reportsTo: parentUserId, approver: parentUserId } }
      );
      assignedCount = result.modifiedCount;
    }

    // Unassign subordinates if requested
    if (Array.isArray(unassignUserIds) && unassignUserIds.length > 0) {
      const result = await User.updateMany(
        { _id: { $in: unassignUserIds }, reportsTo: parentUserId, ...userScope },
        { $set: { reportsTo: null } }
      );
      unassignedCount = result.modifiedCount;
    }

    // Fetch updated direct reports count
    const totalDirectReports = await User.countDocuments({ reportsTo: parentUserId, status: 'active', ...userScope });

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

    const query = {
      status: { $in: ['active', 'ACTIVE'] },
      role: { $nin: ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'] },
      roleCode: { $nin: ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'] }
    };

    if (resolveTenantCompanyId(req)) {
      query.companyId = resolveTenantCompanyId(req);
    }

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

// --- RESPONSIBILITY CONTROLLERS ---
exports.getResponsibilities = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    if (companyId) {
      await seedBaselineMastersForCompany(companyId);
    }
    const responsibilities = await Responsibility.find(companyScopeFilter(companyId))
      .populate('assignedEmployees', 'name fullName email role roleCode employeeIdCode employeeId department designation')
      .sort({ name: 1 });
    res.status(200).json({ success: true, count: responsibilities.length, data: responsibilities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createResponsibility = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    const { code, name, module, description, assignedEmployees, status } = req.body;
    const resp = await Responsibility.create({
      companyId: companyId || null,
      company: companyId || null,
      code: code ? code.trim().toUpperCase() : undefined,
      name,
      module: module || 'General',
      description: description || '',
      assignedEmployees: assignedEmployees || [],
      status: status || 'active'
    });
    const populated = await Responsibility.findOne({ _id: resp._id, ...companyScopeFilter(companyId) })
      .populate('assignedEmployees', 'name fullName email role roleCode employeeIdCode employeeId department designation');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateResponsibility = async (req, res) => {
  try {
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage responsibilities.' });
    }
    const { code, name, module, description, assignedEmployees, status } = req.body;
    const updateFields = {};
    if (code) updateFields.code = code.trim().toUpperCase();
    if (name) updateFields.name = name;
    if (module) updateFields.module = module;
    if (description !== undefined) updateFields.description = description;
    if (assignedEmployees) updateFields.assignedEmployees = assignedEmployees;
    if (status) updateFields.status = status;

    const resp = await Responsibility.findOneAndUpdate(
      { _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) },
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('assignedEmployees', 'name fullName email role roleCode employeeIdCode employeeId department designation');

    if (!resp) return res.status(404).json({ success: false, message: 'Responsibility not found' });
    res.status(200).json({ success: true, data: resp });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteResponsibility = async (req, res) => {
  try {
    if (!canManageAdminConsole(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to manage responsibilities.' });
    }
    const resp = await Responsibility.findOneAndDelete({ _id: req.params.id, ...companyScopeFilter(resolveTenantCompanyId(req)) });
    if (!resp) return res.status(404).json({ success: false, message: 'Responsibility not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.assignEmployeesToResponsibility = async (req, res) => {
  try {
    const companyId = resolveTenantCompanyId(req);
    const scopeFilter = companyScopeFilter(companyId);
    const { responsibilityId, employeeIds, code } = req.body;
    let resp = null;
    if (responsibilityId) {
      resp = await Responsibility.findOne({ _id: responsibilityId, ...scopeFilter });
    } else if (code) {
      resp = await Responsibility.findOne({ code: code.trim().toUpperCase(), ...scopeFilter });
    }
    if (!resp) return res.status(404).json({ success: false, message: 'Responsibility not found' });

    // Ensure the employees being assigned belong to this company
    if (Array.isArray(employeeIds) && employeeIds.length > 0) {
      const ownedCount = await User.countDocuments({ _id: { $in: employeeIds }, ...(companyId ? { companyId } : {}) });
      if (ownedCount !== employeeIds.length) {
        return res.status(403).json({ success: false, message: 'Forbidden: one or more employees do not belong to your company.' });
      }
    }

    resp.assignedEmployees = employeeIds || [];
    await resp.save();

    const populated = await Responsibility.findOne({ _id: resp._id, ...scopeFilter })
      .populate('assignedEmployees', 'name fullName email role roleCode employeeIdCode employeeId department designation');

    res.status(200).json({ success: true, message: 'Assigned staff updated successfully', data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get all employees across all companies/tenants for Super Admin Console
// @route   GET /api/admin/console/all-employees
// @access  Private (Super Admin / Admin Console)
exports.getAllEmployeesAcrossCompanies = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { status: { $in: ['active', 'ACTIVE'] } };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { fullName: searchRegex },
        { email: searchRegex },
        { employeeId: searchRegex },
        { roleCode: searchRegex }
      ];
    }

    const employees = await User.find(filter)
      .populate('company', 'name code')
      .populate('department', 'name code')
      .populate('levelRef')
      .populate('gradeRef')
      .select('_id id name fullName email employeeId employeeCode role roleCode departmentAdminType company companyId status')
      .sort('name');

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

