const express = require('express');
const multer = require('multer');
const {
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    bulkUpload,
    exportEmployees,
    uploadEmployeeDocument,
} = require('../controllers/employees');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getEmployees);
router.get('/export', authorize('admin'), exportEmployees);
router.post('/upload-document', authorize('admin'), uploadEmployeeDocument);
router.post('/', authorize('admin'), upload.single('profileImage'), addEmployee);
router.put('/:id', authorize('admin'), upload.single('profileImage'), updateEmployee);
router.delete('/:id', authorize('admin'), deleteEmployee);
router.post('/bulk-upload', authorize('admin'), upload.single('file'), bulkUpload);

module.exports = router;
