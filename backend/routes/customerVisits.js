const express = require('express');
const {
  createVisit,
  getVisits,
  getVisitById,
  updateVisit,
  deleteVisit,
  startVisit,
  completeVisit,
  getDashboardAnalytics,
  getVisitReports,
} = require('../controllers/customerVisits');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Dashboard & Reports (admin accessible)
router.get('/dashboard', authorize('admin'), getDashboardAnalytics);
router.get('/reports', authorize('admin'), getVisitReports);

router.route('/')
  .post(createVisit) // Create visit (both admin and employee can call)
  .get(getVisits);   // Get visits (employee gets their own, admin gets all)

router.route('/:id')
  .get(getVisitById)
  .put(authorize('admin'), updateVisit)
  .delete(authorize('admin'), deleteVisit);

// Check-in (start) and check-out (complete)
router.post('/:id/start', startVisit);
router.post('/:id/complete', completeVisit);

module.exports = router;
