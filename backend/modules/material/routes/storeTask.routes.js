const express = require('express');
const {
  getTaskByTransaction,
  escalateTask,
  submitTaskForCheck,
  approveTask,
  sendBackTask,
  getStoreEmployees
} = require('../controllers/storeTask.controller');

const router = express.Router();

const { protect } = require('../../../middleware/auth');

router.use(protect);

router.get('/employees', getStoreEmployees);
router.get('/transaction/:txnId', getTaskByTransaction);
router.post('/escalate', escalateTask);
router.post('/:id/submit', submitTaskForCheck);
router.post('/:id/approve', approveTask);
router.post('/:id/send-back', sendBackTask);

module.exports = router;
