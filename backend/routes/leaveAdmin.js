const express = require('express');
const {
  getPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  addRule,
  updateRule,
  deleteRule,
  getPeriods,
  getLedger,
  adjustBalance,
  getPolicyBalances,
  getPolicyMeta,
} = require('../controllers/leavePolicies');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/policies/meta', authorize('admin'), getPolicyMeta);
router.route('/policies')
  .get(authorize('admin'), getPolicies)
  .post(authorize('admin'), createPolicy);
router.route('/policies/:id')
  .put(authorize('admin'), updatePolicy)
  .delete(authorize('admin'), deletePolicy);
router.route('/policies/:id/rules')
  .post(authorize('admin'), addRule);
router.route('/policies/:id/rules/:ruleId')
  .put(authorize('admin'), updateRule)
  .delete(authorize('admin'), deleteRule);

router.get('/periods', authorize('admin'), getPeriods);
router.get('/balances', authorize('admin'), getPolicyBalances);
router.get('/ledger', authorize('admin'), getLedger);
router.post('/ledger/adjust', authorize('admin'), adjustBalance);

module.exports = router;