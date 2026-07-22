const express = require('express');
const {
  getOfficeSettings,
  updateOfficeSettings,
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  seedDatabase,
  getRoleConfig,
  updateRoleConfig,
} = require('../controllers/settings');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/office', getOfficeSettings);
router.put('/office', authorize('admin'), updateOfficeSettings);

router.get('/locations', getLocations);
router.post('/locations', authorize('admin'), createLocation);
router.put('/locations/:id', authorize('admin'), updateLocation);
router.delete('/locations/:id', authorize('admin'), deleteLocation);

router.get('/role-config', getRoleConfig);
router.put('/role-config', authorize('admin'), updateRoleConfig);

router.post('/seed-db', authorize('admin'), seedDatabase);

module.exports = router;
