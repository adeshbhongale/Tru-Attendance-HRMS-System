const express = require('express');
const {
  createNotification,
  getNotifications,
  getNotificationById,
  updateNotification,
  deleteNotification,
  sendNotificationImmediately,
  getNotificationReports,
  getNotificationAnalytics,
  getNotificationTypes,
  registerDeviceToken,
  getEmployeeNotifications,
  getEmployeeUnreadCount,
  markEmployeeNotificationRead,
  markAllEmployeeNotificationsRead,
  deleteEmployeeNotification
} = require('../controllers/notifications');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// All routes require user to be authenticated
router.use(protect);

// ─────────────────────────────────────────────────────────────
// EMPLOYEE & COMMON MOBILE ENDPOINTS
// ─────────────────────────────────────────────────────────────
router.post('/register-token', registerDeviceToken);
router.get('/employee/feed', getEmployeeNotifications);
router.get('/employee/unread-count', getEmployeeUnreadCount);
router.put('/employee/read-all', markAllEmployeeNotificationsRead);
router.put('/employee/read/:id', markEmployeeNotificationRead);
router.delete('/employee/:id', deleteEmployeeNotification);

// ─────────────────────────────────────────────────────────────
// ADMINISTRATIVE DASHBOARD ENDPOINTS
// ─────────────────────────────────────────────────────────────
// Outer layer of admin routing
router.use(authorize('admin'));

router.post('/', createNotification);
router.get('/', getNotifications);
router.get('/reports', getNotificationReports);
router.get('/analytics', getNotificationAnalytics);
router.get('/types', getNotificationTypes);
router.get('/:id', getNotificationById);
router.put('/:id', updateNotification);
router.delete('/:id', deleteNotification);
router.post('/:id/send', sendNotificationImmediately);

module.exports = router;
