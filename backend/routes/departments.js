const express = require('express');
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departments');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getDepartments)
  .post(authorize('admin'), createDepartment);

router.route('/:id')
  .put(authorize('admin'), updateDepartment)
  .delete(authorize('admin'), deleteDepartment);

module.exports = router;
