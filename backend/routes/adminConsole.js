const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const adminConsole = require('../controllers/adminConsoleController');

// All routes require login and super_admin / company_admin / admin role
router.use(protect);

// Company registration is a global-platform operation. Company admins only manage
// masters and workflows after a tenant context has been resolved.
router.route('/companies')
  .get(authorize('superadmin'), adminConsole.getCompanies)
  .post(authorize('superadmin'), adminConsole.createCompany);

router.route('/companies/:id')
  .put(authorize('superadmin'), adminConsole.updateCompany)
  .delete(authorize('superadmin'), adminConsole.deleteCompany);

// Enterprise Org Chart Tree Generator (Accessible to all logged in users)
router.route('/org-chart-tree')
  .get(adminConsole.getOrgChartTree);

router.use(authorize('company_admin', 'admin', 'superadmin'));

// Companies
// Levels
router.route('/levels')
  .get(adminConsole.getLevels)
  .post(adminConsole.createLevel);

router.route('/levels/reorder')
  .put(adminConsole.reorderLevels);

router.route('/levels/:id')
  .put(adminConsole.updateLevel)
  .delete(adminConsole.deleteLevel);

// Grades
router.route('/grades')
  .get(adminConsole.getGrades)
  .post(adminConsole.createGrade);

router.route('/grades/:id')
  .put(adminConsole.updateGrade)
  .delete(adminConsole.deleteGrade);

// Dynamic Role Templates
router.route('/role-templates')
  .get(adminConsole.getRoleTemplates)
  .post(adminConsole.createRoleTemplate);

// Responsibilities
router.route('/responsibilities')
  .get(adminConsole.getResponsibilities)
  .post(adminConsole.createResponsibility);

router.route('/responsibilities/assign')
  .post(adminConsole.assignEmployeesToResponsibility);

router.route('/responsibilities/:id')
  .put(adminConsole.updateResponsibility)
  .delete(adminConsole.deleteResponsibility);

// Approval Workflows
router.route('/workflows')
  .get(adminConsole.getWorkflows)
  .post(adminConsole.createWorkflow);

router.route('/workflows/test-evaluate')
  .post(adminConsole.testEvaluateWorkflow);

router.route('/workflows/:id')
  .put(adminConsole.updateWorkflow)
  .delete(adminConsole.deleteWorkflow);

// Reporting Hierarchy
router.route('/reporting-hierarchy')
  .get(adminConsole.getReportingHierarchy)
  .put(adminConsole.updateEmployeeReporting);

// Parent-Child Hierarchy Rules Master
router.route('/parent-child-rules')
  .get(adminConsole.getParentChildRules)
  .post(adminConsole.upsertParentChildRule);

router.route('/parent-child-rules/:id')
  .delete(adminConsole.deleteParentChildRule);

// Subordinate Selector & Bulk Assignment
router.route('/selectable-subordinates')
  .get(adminConsole.getSelectableSubordinatesForParent);

router.route('/assign-subordinates')
  .post(adminConsole.assignSubordinates);

// Enterprise Org Chart Tree Generator
router.route('/org-chart-tree')
  .get(adminConsole.getOrgChartTree);

// All Employees Across All Tenant Companies (for Super Admin Console Workflow Policies)
router.route('/all-employees')
  .get(adminConsole.getAllEmployeesAcrossCompanies);

module.exports = router;
