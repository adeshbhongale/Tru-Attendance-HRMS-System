const express = require('express');
const {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  assignShift,
} = require('../controllers/shifts');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getShifts);
router.post('/', authorize('admin'), createShift);
router.post('/assign', authorize('admin'), assignShift);
router.put('/:id', authorize('admin'), updateShift);
router.delete('/:id', authorize('admin'), deleteShift);

module.exports = router;
