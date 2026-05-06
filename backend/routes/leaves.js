const express = require('express');
const {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
} = require('../controllers/leaves');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/', applyLeave);
router.get('/my-leaves', getMyLeaves);
router.get('/', authorize('admin'), getAllLeaves);
router.patch('/:id', authorize('admin'), updateLeaveStatus);

module.exports = router;
