const express = require('express');
const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  importHolidays,
} = require('../controllers/holidays');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getHolidays)
  .post(authorize('admin'), createHoliday);

router.post('/import', authorize('admin'), importHolidays);

router.route('/:id')
  .put(authorize('admin'), updateHoliday)
  .delete(authorize('admin'), deleteHoliday);

module.exports = router;
