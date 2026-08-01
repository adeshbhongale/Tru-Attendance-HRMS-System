const express = require('express');
const router = express.Router();

const transactionRoutes = require('./transaction.routes');
const barcodeRoutes = require('./barcode.routes');
const chatRoutes = require('./chat.routes');
const dashboardRoutes = require('./dashboard.routes');
const auditRoutes = require('./audit.routes');
const reportRoutes = require('./report.routes');
const uploadRoutes = require('./upload.routes');
const receivingRoutes = require('./receiving.routes');
const searchRoutes = require('./search.routes');
const tallyRoutes = require('./tally.routes');

router.use('/transactions', transactionRoutes);
router.use('/barcodes', barcodeRoutes);
router.use('/chat', chatRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/reports', reportRoutes);
router.use('/upload', uploadRoutes);
router.use('/receiving', receivingRoutes);
router.use('/search', searchRoutes);
router.use('/tally', tallyRoutes);

module.exports = router;
