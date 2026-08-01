const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');

// Standalone Tally Prime Voucher Controller for Barcode Exchange
exports.postTallyBarcodeExchange = async (oldBarcode, newBarcode, godownName, documentNumber) => {
  const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
  const companyName = 'TCSL DEMO';
  const dateStr = process.env.TALLY_TEST_DATE || '20260301';
  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bc = await Barcode.findOne({ barcode: oldBarcode });
  const itemName = bc?.materialName || '';
  const unit = bc?.unit || 'Nos';
  const price = bc?.price || 1000;
  const targetGodown = (godownName && godownName.toLowerCase().includes('gokul')) ? 'GOKUL SHIRGAON' : (godownName || 'GOKUL SHIRGAON');

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
            <NARRATION>Exchange barcode by ${esc(targetGodown)} from old ${esc(oldBarcode)} to new ${esc(newBarcode)}</NARRATION>

            <!-- Outward Old Item Batch -->
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${price}/${esc(unit)}</RATE>
              <AMOUNT>${price}</AMOUNT>
              <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
                <BATCHNAME>${esc(oldBarcode)}</BATCHNAME>
                <AMOUNT>${price}</AMOUNT>
                <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>

            <!-- Inward Replacement Item Batch -->
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${price}/${esc(unit)}</RATE>
              <AMOUNT>-${price}</AMOUNT>
              <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
                <BATCHNAME>${esc(newBarcode)}</BATCHNAME>
                <AMOUNT>-${price}</AMOUNT>
                <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
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
