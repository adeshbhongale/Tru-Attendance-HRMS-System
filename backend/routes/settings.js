const express = require('express');
const {
  getOfficeSettings,
  updateOfficeSettings,
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
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

module.exports = router;
