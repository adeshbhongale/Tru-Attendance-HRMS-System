const express = require('express');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customers');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getCustomers)
  .post(createCustomer); // Allowed for both employees (from mobile) and admins

router.route('/:id')
  .get(getCustomerById)
  .put(authorize('admin'), updateCustomer)
  .delete(authorize('admin'), deleteCustomer);

module.exports = router;
