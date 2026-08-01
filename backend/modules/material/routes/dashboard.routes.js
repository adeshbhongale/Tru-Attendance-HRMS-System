const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../../../middleware/auth');

router.use(protect);
router.get('/stats', dashboardController.getStats);
router.get('/charts', dashboardController.getChartData);
router.get('/recent', dashboardController.getRecentActivities);
router.get('/', dashboardController.getDashboard);

module.exports = router;
