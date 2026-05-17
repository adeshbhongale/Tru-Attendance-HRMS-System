const express = require('express');
const {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
} = require('../controllers/leaveTypes');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getLeaveTypes)
  .post(authorize('admin'), createLeaveType);

router.route('/:id')
  .put(authorize('admin'), updateLeaveType)
  .delete(authorize('admin'), deleteLeaveType);

module.exports = router;
