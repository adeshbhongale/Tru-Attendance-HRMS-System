const express = require('express');
const {
  getDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
} = require('../controllers/designations');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getDesignations)
  .post(createDesignation);

router.route('/:id')
  .put(updateDesignation)
  .delete(deleteDesignation);

module.exports = router;
