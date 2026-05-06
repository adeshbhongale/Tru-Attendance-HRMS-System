const express = require('express');
const multer = require('multer');
const {
  getEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  bulkUpload,
} = require('../controllers/employees');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/', getEmployees);
router.post('/', addEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.post('/bulk-upload', upload.single('file'), bulkUpload);

module.exports = router;
