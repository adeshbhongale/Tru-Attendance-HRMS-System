const express = require('express');
const {
  getCalendarMonthEvents,
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} = require('../controllers/taskController');

const router = express.Router();
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/calendar', getCalendarMonthEvents);

router.route('/')
  .get(getTasks)
  .post(createTask);

router.route('/:id')
  .put(updateTask)
  .delete(deleteTask);

router.patch('/:id/status', updateTaskStatus);

module.exports = router;
