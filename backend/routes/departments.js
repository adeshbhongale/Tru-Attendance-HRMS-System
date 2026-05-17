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
router.use(authorize('admin'));

router.route('/')
  .get(getDepartments)
  .post(createDepartment);

router.route('/:id')
  .put(updateDepartment)
  .delete(deleteDepartment);

module.exports = router;
