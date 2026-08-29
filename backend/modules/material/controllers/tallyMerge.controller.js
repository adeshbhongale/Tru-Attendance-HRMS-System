const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');
const tallyController = require('./tally.controller');

// Standalone Tally Prime Voucher Controller for Barcode Merge
exports.postTallyBarcodeMerge = async (childBarcodes, mergedBarcode, godownName, documentNumber, voucherDate) => {
  const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
  const companyName = 'TCSL DEMO';
  const dateStr = tallyController.formatTallyDate ? tallyController.formatTallyDate(voucherDate) : (voucherDate ? new Date(voucherDate).toISOString().slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bc = await Barcode.findOne({ barcode: childBarcodes[0], companyId: req.tenant.companyId });
  const itemName = bc?.materialName || '10.1 Inch Industrial Panel PC';
  const unit = bc?.unit || 'Nos';
  const price = bc?.price || 1000;
  const count = childBarcodes.length || 2;
  const targetGodown = (godownName && godownName.toLowerCase().includes('gokul')) ? 'GOKUL SHIRGAON' : (godownName || 'GOKUL SHIRGAON');

  const childXmlEntries = childBarcodes.map((cBc) => `
    <INVENTORYENTRIESOUT.LIST>
      <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <RATE>${price}/${esc(unit)}</RATE>
      <AMOUNT>${price}</AMOUNT>
      <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
      <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
        <BATCHNAME>${esc(cBc)}</BATCHNAME>
        <AMOUNT>${price}</AMOUNT>
        <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESOUT.LIST>`).join('\n');

  const xmlPayload = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Import</TALLYREQUEST>
      <TYPE>Data</TYPE>
      <ID>Vouchers</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
            <DATE>${dateStr}</DATE>
            <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${esc(documentNumber)}</VOUCHERNUMBER>
            <NARRATION>Merged barcodes (${childBarcodes.join(', ')}) into parent barcode ${esc(mergedBarcode)}</NARRATION>

            ${childXmlEntries}

            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${price}/${esc(unit)}</RATE>
              <AMOUNT>-${price * count}</AMOUNT>
              <ACTUALQTY>${count} ${esc(unit)}</ACTUALQTY>
              <BILLEDQTY>${count} ${esc(unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
                <BATCHNAME>${esc(mergedBarcode)}</BATCHNAME>
                <AMOUNT>-${price * count}</AMOUNT>
                <ACTUALQTY>${count} ${esc(unit)}</ACTUALQTY>
                <BILLEDQTY>${count} ${esc(unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const voucherRes = await axios.post(liveTallyUrl, xmlPayload, { headers: { 'Content-Type': 'text/xml' } });
  const cleanTallyXml = (str) => String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
  const parsed = await parser.parseStringPromise(cleanTallyXml(voucherRes.data));
  return parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT || { success: true };
};
