const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payroll.controller');

const norm = (v) => String(v || '').trim().toLowerCase().replace(/[-\s]/g, '_');

const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin', 'tcsa1'];
const COMPANY_ADMIN_ROLES = ['admin', 'company_admin', 'companyadmin', 'tcca1'];
const HR_ADMIN_ROLES = ['hr', 'hr_admin', 'dept:hr_admin'];

function canAccessPayroll(user) {
  if (!user) return false;
  if (user.scope === 'GLOBAL') return true;

  const role = norm(user.role);
  const roleCode = norm(user.roleCode);
  const deptAdminType = norm(user.departmentAdminType || user.adminType);

  if (SUPER_ADMIN_ROLES.includes(role) || SUPER_ADMIN_ROLES.includes(roleCode)) {
    return true;
  }
  if (COMPANY_ADMIN_ROLES.includes(role) || COMPANY_ADMIN_ROLES.includes(roleCode)) {
    return true;
  }
  if (HR_ADMIN_ROLES.includes(role) || HR_ADMIN_ROLES.includes(roleCode)) {
    return true;
  }
  if (role === 'department_admin' && deptAdminType === 'hr') {
    return true;
  }
  return false;
}

const requirePayrollRole = (req, res, next) =>
  canAccessPayroll(req.user)
    ? next()
    : res.status(403).json({
        success: false,
        message: 'Forbidden: Payroll access is restricted to Super Admin, Company Admin, and HR Admin only.',
      });

router.use(requirePayrollRole);

router.get('/', payrollController.getPayroll);
router.post('/entry', payrollController.updatePayrollEntry);
router.put('/entry', payrollController.updatePayrollEntry);
router.patch('/entry', payrollController.updatePayrollEntry);
router.post('/settings', payrollController.updatePayrollSettings);
router.put('/settings', payrollController.updatePayrollSettings);
router.patch('/settings', payrollController.updatePayrollSettings);
router.get('/export', payrollController.exportPayroll);

router.canAccessPayroll = canAccessPayroll;
router.requirePayrollRole = requirePayrollRole;

module.exports = router;
