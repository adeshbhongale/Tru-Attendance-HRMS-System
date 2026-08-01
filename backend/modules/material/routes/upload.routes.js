const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { protect } = require('../../../middleware/auth');

router.use(protect);
router.post('/', uploadController.uploadMiddleware, uploadController.uploadFile);
router.post('/base64', uploadController.uploadBase64);

module.exports = router;
