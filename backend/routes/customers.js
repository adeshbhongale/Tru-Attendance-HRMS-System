const express = require('express');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  uploadCustomerDocument,
} = require('../controllers/customers');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/upload-document', uploadCustomerDocument);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomerById)
  .put(authorize('admin'), updateCustomer)
  .delete(authorize('admin'), deleteCustomer);

module.exports = router;
