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
    const { barcode, employeeGodown, materialName, unit, price, voucherDate } = req.body;
    const godown = employeeGodown || '';
    const materialForTally = [{
      name: materialName || '',
      quantity: 1,
      unit: unit || 'Nos',
      price: price || 1000,
      barcodes: [barcode]
    }];
    const result = await tallyController.createTallyGodownTransfer('DC Internal', 'return', godown, godown, materialForTally, voucherDate || new Date());
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Standalone endpoints for Tally Prime Exchange & Merge vouchers
router.post('/exchange', async (req, res) => {
  try {
    const { oldBarcode, newBarcode, godownName, documentNumber, voucherDate } = req.body;
    const docNum = documentNumber || `EXCH-${Date.now()}`;
    const result = await tallyExchangeController.postTallyBarcodeExchange(oldBarcode, newBarcode, godownName, docNum, voucherDate || new Date());
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/merge', async (req, res) => {
  try {
    const { childBarcodes, mergedBarcode, godownName, documentNumber, voucherDate } = req.body;
    const docNum = documentNumber || `MERGE-${Date.now()}`;
    const result = await tallyMergeController.postTallyBarcodeMerge(childBarcodes, mergedBarcode, godownName, docNum, voucherDate || new Date());
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/material-vouchers', async (req, res) => {
  try {
    const axios = require('axios');
    const xml2js = require('xml2js');
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    const companyName = req.query.company || 'TCSL DEMO';

    const queryXml = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>AllStockJournals</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="AllStockJournals" ISINITIALIZE="Yes">
                <TYPE>Voucher</TYPE>
                <FETCH>Date, VoucherTypeName, VoucherNumber, Narration, InventoryEntries, InventoryEntriesIn, InventoryEntriesOut, AllInventoryEntries</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const tRes = await axios.post(liveTallyUrl, queryXml, { headers: { 'Content-Type': 'text/xml' } });
    const rawXml = typeof tRes.data === 'string' ? tRes.data : String(tRes.data);
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
    const parsed = await parser.parseStringPromise(rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;'));
    const rawVouchers = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
    const allVouchers = Array.isArray(rawVouchers) ? rawVouchers : (rawVouchers ? [rawVouchers] : []);

    const mmsVouchers = allVouchers.filter(v => {
      const n = typeof v.NARRATION === 'string' ? v.NARRATION : (v.NARRATION?._ || '');
      return n.includes('RDC') || n.includes('Barcode') || n.includes('Split') || n.includes('Exchange') || n.includes('Merge') || n.includes('Transfer') || n.includes('Return');
    });

    res.json({
      success: true,
      totalFound: mmsVouchers.length,
      vouchers: mmsVouchers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
