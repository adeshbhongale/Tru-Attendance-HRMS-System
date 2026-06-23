const express = require('express');
const {
  punchIn,
  punchOut,
  getHistory,
  getAllAttendance,
  trackLocation,
  getMonthlyView,
  toggleBreak,
  trackBatch,
  adminEditAttendance,
  gpsStatusUpdate
} = require('../controllers/attendance');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/punch-in', punchIn);
router.post('/punch-out', punchOut);
router.post('/break', toggleBreak);
router.get('/history', getHistory);
router.get('/monthly-view', getMonthlyView);
router.post('/track', trackLocation);
router.post('/track-batch', trackBatch);
router.post('/gps-status', gpsStatusUpdate);
router.get('/', authorize('admin'), getAllAttendance);

// Admin-only: edit any attendance record directly
router.put('/admin-edit/:attendanceId', authorize('admin'), adminEditAttendance);

module.exports = router;

