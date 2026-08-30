const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getMobileAppConfig,
  updateMobileAppConfig,
  getMyMobileAccess,
} = require('../controllers/mobileAppConfig');

router.use(protect);

// Employee endpoint — any authenticated user can check their own access
router.get('/my-access', getMyMobileAccess);

// Super Admin only endpoints — get and update config
router.get('/', authorize('superadmin'), getMobileAppConfig);
router.put('/', authorize('superadmin'), updateMobileAppConfig);

module.exports = router;
