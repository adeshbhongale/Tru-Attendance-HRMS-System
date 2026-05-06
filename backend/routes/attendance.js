const express = require('express');
const {
  punchIn,
  punchOut,
  getHistory,
  getAllAttendance,
} = require('../controllers/attendance');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/punch-in', punchIn);
router.post('/punch-out', punchOut);
router.get('/history', getHistory);
router.get('/', authorize('admin'), getAllAttendance);

module.exports = router;
