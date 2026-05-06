const express = require('express');
const {
  getDailyReport,
  getMonthlyReport,
  getStats,
} = require('../controllers/reports');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/daily', getDailyReport);
router.get('/monthly', getMonthlyReport);
router.get('/stats', getStats);

module.exports = router;
