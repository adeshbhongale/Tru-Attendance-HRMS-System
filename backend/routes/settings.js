const express = require('express');
const {
  getOfficeSettings,
  updateOfficeSettings,
} = require('../controllers/settings');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/office', getOfficeSettings);
router.put('/office', authorize('admin'), updateOfficeSettings);

module.exports = router;
