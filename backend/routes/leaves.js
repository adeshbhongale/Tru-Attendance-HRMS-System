const express = require('express');
const {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
  getLeaveDashboard,
  cancelLeave,
  updateLeave,
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
router.get('/', authorize('admin'), getAllLeaves);
router.patch('/cancel/:id', cancelLeave);
router.put('/update/:id', updateLeave);
router.patch('/:id', authorize('admin'), updateLeaveStatus);
router.put('/:id/status', authorize('admin'), updateLeaveStatus);
router.patch('/:id/status', authorize('admin'), updateLeaveStatus);
router.put('/:id', authorize('admin'), updateLeaveStatus);

module.exports = router;
