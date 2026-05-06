const express = require('express');
const {
  getDailyReport,
  getMonthlyReport,
  getStats,
  getEmployeeStats
} = require('../controllers/reports');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/my-stats', getEmployeeStats);

// Admin only routes
router.get('/daily', authorize('admin'), getDailyReport);
router.get('/monthly', authorize('admin'), getMonthlyReport);
router.get('/stats', authorize('admin'), getStats);

module.exports = router;
