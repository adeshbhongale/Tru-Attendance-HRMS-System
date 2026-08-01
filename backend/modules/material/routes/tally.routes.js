const express = require('express');
const router = express.Router();
const tallyController = require('../controllers/tally.controller');
const tallyDcFocController = require('../controllers/tallyDcFoc.controller');
const tallyExchangeController = require('../controllers/tallyExchange.controller');
const tallyMergeController = require('../controllers/tallyMerge.controller');
const { protect } = require('../../../middleware/auth');

router.use(protect);

// Real-time proxy endpoint querying the company's live Tally Prime server
router.get('/inventory', tallyController.getLiveInventory);

// Standalone endpoint for DC Internal (delegates directly to tallyController.createTallyGodownTransfer)
router.post('/dc-internal', async (req, res) => {
  try {
    const { barcode, employeeGodown, materialName, unit, price } = req.body;
    const godown = employeeGodown || '';
    const materialForTally = [{
      name: materialName || '',
      quantity: 1,
      unit: unit || 'Nos',
      price: price || 1000,
      barcodes: [barcode]
    }];
    const result = await tallyController.createTallyGodownTransfer('DC Internal', 'return', godown, godown, materialForTally);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Standalone endpoints for Tally Prime Exchange & Merge vouchers
router.post('/exchange', async (req, res) => {
  try {
    const { oldBarcode, newBarcode, godownName, documentNumber } = req.body;
    const docNum = documentNumber || `EXCH-${Date.now()}`;
    const result = await tallyExchangeController.postTallyBarcodeExchange(oldBarcode, newBarcode, godownName, docNum);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/merge', async (req, res) => {
  try {
    const { childBarcodes, mergedBarcode, godownName, documentNumber } = req.body;
    const docNum = documentNumber || `MERGE-${Date.now()}`;
    const result = await tallyMergeController.postTallyBarcodeMerge(childBarcodes, mergedBarcode, godownName, docNum);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
