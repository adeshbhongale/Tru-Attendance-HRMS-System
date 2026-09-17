const express = require('express');
const {
  getStoreConfig,
  upsertStoreConfig,
} = require('../controllers/storeConfig.controller');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Only SuperAdmin or appropriate roles can manage store config
router.route('/')
  .get(getStoreConfig)
  .post(authorize('superadmin', 'TCSA1', 'admin', 'company_admin'), upsertStoreConfig);

module.exports = router;
