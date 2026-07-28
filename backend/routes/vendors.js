const express = require('express');
const {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  uploadVendorDocument,
} = require('../controllers/vendors');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/upload-document', uploadVendorDocument);

router.route('/')
  .get(getVendors)
  .post(createVendor);

router.route('/:id')
  .get(getVendorById)
  .put(updateVendor)
  .delete(deleteVendor);

module.exports = router;
