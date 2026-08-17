const express = require('express');
const {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
  getLeaveDashboard,
  cancelLeave,
  updateLeave,
  getEmployeeBalances,
  setEmployeeBalance,
  getMyApprovals,
  approveLeave,
  rejectLeave,
} = require('../controllers/leaves');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use((req, res, next) => {
  next();
});

router.use(protect);

router.post('/', applyLeave);
router.get('/my-leaves', getMyLeaves);
router.get('/dashboard', authorize('admin'), getLeaveDashboard);
router.get('/balances', authorize('admin'), getEmployeeBalances);
router.put('/balances/:userId/:leaveTypeId', authorize('admin'), setEmployeeBalance);
router.get('/', authorize('admin'), getAllLeaves);
router.patch('/cancel/:id', cancelLeave);
router.put('/update/:id', updateLeave);

// Reporting-manager approval (backend-enforced via reportingTo)
router.get('/approvals', getMyApprovals);
router.patch('/approvals/:id/approve', approveLeave);
router.patch('/approvals/:id/reject', rejectLeave);

// Admin/global status changes (legacy, kept for admin console & backwards compat)
router.patch('/:id', authorize('admin'), updateLeaveStatus);
router.put('/:id/status', authorize('admin'), updateLeaveStatus);
router.patch('/:id/status', authorize('admin'), updateLeaveStatus);
router.put('/:id', authorize('admin'), updateLeaveStatus);

module.exports = router;