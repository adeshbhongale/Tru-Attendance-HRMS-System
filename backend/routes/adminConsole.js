const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const adminConsole = require('../controllers/adminConsoleController');

// All routes require login and super_admin / company_admin / admin role
router.use(protect);
router.use(authorize('super_admin', 'company_admin', 'admin'));

// Companies
router.route('/companies')
  .get(adminConsole.getCompanies)
  .post(adminConsole.createCompany);

router.route('/companies/:id')
  .put(adminConsole.updateCompany);

// Levels
router.route('/levels')
  .get(adminConsole.getLevels)
  .post(adminConsole.createLevel);

router.route('/levels/:id')
  .put(adminConsole.updateLevel);

// Grades
router.route('/grades')
  .get(adminConsole.getGrades)
  .post(adminConsole.createGrade);

router.route('/grades/:id')
  .put(adminConsole.updateGrade);

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

// Approval Workflows
router.route('/workflows')
  .get(adminConsole.getWorkflows)
  .post(adminConsole.createWorkflow);

router.route('/workflows/test-evaluate')
  .post(adminConsole.testEvaluateWorkflow);

router.route('/workflows/:id')
  .put(adminConsole.updateWorkflow);

// Reporting Hierarchy
router.route('/reporting-hierarchy')
  .get(adminConsole.getReportingHierarchy)
  .put(adminConsole.updateEmployeeReporting);

module.exports = router;
