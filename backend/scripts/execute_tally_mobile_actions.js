const axios = require('axios');
const xml2js = require('xml2js');

const TALLY_URL = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
const COMPANY_NAME = 'TCSL DEMO';
function getActualDateStr() {
  if (process.env.TALLY_TEST_DATE) return process.env.TALLY_TEST_DATE;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
const TEST_DATE = getActualDateStr();

const esc = (str) => (str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '');

const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });

function getNarration(v) {
  if (!v || !v.NARRATION) return '';
  if (typeof v.NARRATION === 'string') return v.NARRATION;
  if (typeof v.NARRATION === 'object') return v.NARRATION._ || '';
  return String(v.NARRATION);
}

function cleanQty(qtyStr) {
  if (!qtyStr) return '1 Nos';
  const str = String(qtyStr).replace(/-/g, '').trim();
  return str.startsWith('0') ? '1 Nos' : (str.includes('Nos') ? str : `${str} Nos`);
}

function cleanRate(rateStr, defaultRate = 2550) {
  if (!rateStr) return `₹${defaultRate}.00/Nos`;
  const str = String(rateStr).replace(/-/g, '').trim();
  return str.startsWith('₹') ? str : (str.includes('/Nos') ? `₹${str}` : `₹${str}.00/Nos`);
}

async function postTallyXML(xml) {
  const sanitized = xml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
  const res = await axios.post(TALLY_URL, sanitized, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 10000,
  });
  const rawXml = typeof res.data === 'string' ? res.data : String(res.data);
  const parsed = await parser.parseStringPromise(rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;'));
  return { raw: rawXml, parsed };
}

// -------------------------------------------------------------
// 1. CREATE RDC / STORE DISPATCH
// Voucher Type: Gokul Shirgaon Godown Transfer
// Barcode: 02910004 (1 Unit: GOKUL SHIRGAON -> Adesh Bhongale)
// -------------------------------------------------------------
async function executeRdcDispatch(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`1. EXECUTING RDC STORE DISPATCH [${data.transactionId}]`);
  console.log(`   Voucher Type: Gokul Shirgaon Godown Transfer`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   Source: ${data.fromGodown} ➔ Destination: ${data.toGodown}`);
  console.log(`   Material: ${data.materialName} | Serial Barcode: ${data.barcode} | Qty: 1 Nos`);

  const narration = `RDC Material Sourcing Dispatch #${data.transactionId} | Barcode: ${data.barcode} | Receiver: ${data.toGodown} [${data.sessionTag}]`;

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Gokul Shirgaon Godown Transfer" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Gokul Shirgaon Godown Transfer</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.fromGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.toGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Gokul Shirgaon Godown Transfer Voucher)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 2. SPLIT MATERIAL
// Voucher Type: Autofill Stock Journal
// Source: 1 Unit [02910004]
// Destination: 2 Barcodes -> Old [02910004] (1 unit) + New [123456] (1 unit)
// -------------------------------------------------------------
async function executeSplitMaterial(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`2. EXECUTING SPLIT MATERIAL [Parent: ${data.parentBarcode} ➔ Destination: Old #${data.parentBarcode} + New #${data.newBarcode}]`);
  console.log(`   Voucher Type: Autofill Stock Journal`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   Source (OUT)      : 1 Nos [${data.parentBarcode}]`);
  console.log(`   Destination (IN)  : 1 Nos [Old: ${data.parentBarcode}] + 1 Nos [New: ${data.newBarcode}]`);
  console.log(`   Godown: ${data.godown} | Material: ${data.materialName}`);

  const narration = `Split Barcode #${data.parentBarcode} into Old #${data.parentBarcode} + New Child #${data.newBarcode} | Reason: ${data.reason} [${data.sessionTag}]`;

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            <!-- Source Side: 1 Unit Barcode 02910004 -->
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.parentBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>
            <!-- Destination Side 1: Old Barcode 02910004 -->
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.parentBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
            <!-- Destination Side 2: New Barcode 123456 -->
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.newBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Split Voucher: 1 Source Barcode ➔ 2 Destination Barcodes)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 3. EXCHANGE DEFECTIVE MATERIAL
// Voucher Type: Autofill Stock Journal
// Source: 1 Unit [02910004] ➔ Destination: 1 Unit [1234567]
// -------------------------------------------------------------
async function executeExchangeMaterial(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`3. EXECUTING EXCHANGE MATERIAL [Source: ${data.oldBarcode} ➔ Destination: ${data.newBarcode}]`);
  console.log(`   Voucher Type: Autofill Stock Journal`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   Consumption: 1 Nos [${data.oldBarcode}] ➔ Production: 1 Nos [${data.newBarcode}]`);
  console.log(`   Godown: ${data.godown} | Material: ${data.materialName}`);

  const narration = `Exchange Defective Barcode #${data.oldBarcode} with Replacement #${data.newBarcode} | Reason: ${data.warrantyReason} [${data.sessionTag}]`;

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.oldBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.newBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Autofill Stock Journal Voucher)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 4. MERGE MATERIAL LOTS
// Voucher Type: Autofill Stock Journal
// Source: Barcodes [123456] + [1234567] (1 unit each)
// Destination: 1 Merged Master Barcode [12345678] (1 Unit)
// -------------------------------------------------------------
async function executeMergeMaterial(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`4. EXECUTING MERGE MATERIAL [${data.childBarcodes.join(', ')} ➔ Master Lot: ${data.mergedBarcode}]`);
  console.log(`   Voucher Type: Autofill Stock Journal`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   Consumption: 1 Nos [${data.childBarcodes[0]}] + 1 Nos [${data.childBarcodes[1]}] ➔ Production: 1 Nos [${data.mergedBarcode}]`);
  console.log(`   Godown: ${data.godown} | Material: ${data.materialName}`);

  const narration = `Merge Barcodes [${data.childBarcodes.join(', ')}] into Master Lot #${data.mergedBarcode} | Reason: ${data.reason} [${data.sessionTag}]`;

  const consumptionLines = data.childBarcodes.map((bc) => `
    <INVENTORYENTRIESOUT.LIST>
      <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <RATE>${data.rate}</RATE>
      <AMOUNT>${data.rate}</AMOUNT>
      <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
      <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${esc(bc)}</BATCHNAME>
        <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${data.rate}</RATE>
        <AMOUNT>${data.rate}</AMOUNT>
        <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESOUT.LIST>
  `).join('');

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            ${consumptionLines}
            <!-- 1 Unit Production for Master Lot -->
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.mergedBarcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.godown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Merge Stock Journal Voucher)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 5. CUSTODY TRANSFER
// Voucher Type: Gokul Shirgaon Godown Transfer
// Barcode: 12345678 (1 Unit: Adesh Bhongale -> Akshay Kusale)
// -------------------------------------------------------------
async function executeTransferMaterial(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`5. EXECUTING CUSTODY TRANSFER [${data.barcode}]`);
  console.log(`   Voucher Type: Gokul Shirgaon Godown Transfer`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   From: ${data.fromGodown} ➔ To: ${data.toGodown}`);
  console.log(`   Material: ${data.materialName} | Barcode: ${data.barcode} | Qty: 1 Nos`);

  const narration = `Barcode Custody Transfer #${data.barcode} from ${data.fromGodown} to ${data.toGodown} | Reason: ${data.reason} [${data.sessionTag}]`;

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Gokul Shirgaon Godown Transfer" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Gokul Shirgaon Godown Transfer</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.fromGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.toGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Gokul Shirgaon Godown Transfer Voucher)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 6. RETURN MATERIAL TO STORE
// Voucher Type: Gokul Shirgaon Godown Transfer
// Barcode: 12345678 (1 Unit: Akshay Kusale -> GOKUL SHIRGAON)
// -------------------------------------------------------------
async function executeReturnMaterial(data) {
  const vDate = data.voucherDate || TEST_DATE;
  console.log('\n========================================================================');
  console.log(`6. EXECUTING RETURN MATERIAL TO STORE [${data.barcode}]`);
  console.log(`   Voucher Type: Gokul Shirgaon Godown Transfer`);
  console.log(`   Date        : ${vDate}`);
  console.log(`   From: ${data.fromGodown} ➔ To: ${data.toGodown}`);
  console.log(`   Material: ${data.materialName} | Barcode: ${data.barcode} | Qty: 1 Nos`);

  const narration = `Return to Store Warehouse #${data.barcode} from ${data.fromGodown} to ${data.toGodown} | Condition: ${data.condition} | Reason: ${data.reason} [${data.sessionTag}]`;

  const xml = `
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
          <SVCURRENTCOMPANY>${esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Gokul Shirgaon Godown Transfer" ACTION="Create">
            <DATE>${vDate}</DATE>
            <VOUCHERTYPENAME>Gokul Shirgaon Godown Transfer</VOUCHERTYPENAME>
            <NARRATION>${esc(narration)}</NARRATION>
            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.fromGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESOUT.LIST>
            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${esc(data.materialName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${data.rate}</RATE>
              <AMOUNT>-${data.rate}</AMOUNT>
              <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
              <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>${esc(data.barcode)}</BATCHNAME>
                <GODOWNNAME>${esc(data.toGodown)}</GODOWNNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <RATE>${data.rate}</RATE>
                <AMOUNT>-${data.rate}</AMOUNT>
                <ACTUALQTY>1 ${esc(data.unit)}</ACTUALQTY>
                <BILLEDQTY>1 ${esc(data.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </INVENTORYENTRIESIN.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(xml);
  const ok = res.raw.includes('CREATED>1');
  console.log(`   Tally Result: ${ok ? '✅ SUCCESS (Created Gokul Shirgaon Godown Transfer Voucher)' : '⚠️ Response: ' + res.raw}`);
}

// -------------------------------------------------------------
// 7. FETCH AND DISPLAY EXACTLY THE 6 CREATED VOUCHERS
// -------------------------------------------------------------
async function fetchAndReportAllVouchers(sessionTag) {
  console.log('\n========================================================================');
  console.log('       LIVE TALLY PRIME VOUCHERS CREATED (Company: TCSL DEMO)');
  console.log('========================================================================\n');

  const queryXml = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>AllVouchersReport</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>20260301</SVFROMDATE>
          <SVTODATE>20260331</SVTODATE>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="AllVouchersReport" ISINITIALIZE="Yes">
              <TYPE>Voucher</TYPE>
              <FETCH>Date, VoucherTypeName, VoucherNumber, Narration, InventoryEntries, InventoryEntriesIn, InventoryEntriesOut, AllInventoryEntries</FETCH>
            </COLLECTION>
          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>`;

  const res = await postTallyXML(queryXml);
  const rawVouchers = res.parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
  const allVouchers = Array.isArray(rawVouchers) ? rawVouchers : (rawVouchers ? [rawVouchers] : []);

  // Filter strictly for the 6 vouchers created in this session
  const sessionVouchers = allVouchers.filter(v => {
    const n = getNarration(v);
    return n.includes(sessionTag);
  });

  const ACTION_TITLES = [
    'ACTION 1: RDC / STORE DISPATCH',
    'ACTION 2: SPLIT MATERIAL LOT (1 SOURCE BARCODE ➔ 2 DESTINATION BARCODES)',
    'ACTION 3: EXCHANGE DEFECTIVE BARCODE',
    'ACTION 4: MERGE MATERIAL LOTS',
    'ACTION 5: PEER-TO-PEER CUSTODY TRANSFER',
    'ACTION 6: RETURN MATERIAL TO STORE',
  ];

  sessionVouchers.forEach((v, index) => {
    const vDate = v.DATE?._ || v.DATE || TEST_DATE;
    const vType = v.VOUCHERTYPENAME?._ || v.VOUCHERTYPENAME || 'Stock Journal';
    const vNum = v.VOUCHERNUMBER?._ || v.VOUCHERNUMBER || `VCH-${index + 1}`;
    const vNarration = getNarration(v);
    const actionTitle = ACTION_TITLES[index] || `ACTION ${index + 1}`;

    console.log(`[${actionTitle}]`);
    console.log(`  Voucher Type : ${vType}`);
    console.log(`  Voucher No   : ${vNum}`);
    console.log(`  Date         : ${vDate}`);
    console.log(`  Narration    : ${vNarration}`);

    // Parse Outward lines (Consumption)
    const outList = v['INVENTORYENTRIESOUT.LIST'] || v['ALLINVENTORYENTRIES.LIST'];
    if (outList) {
      const outs = Array.isArray(outList) ? outList : [outList];
      outs.filter(o => o.ISDEEMEDPOSITIVE === 'No' || o.ISDEEMEDPOSITIVE?._ === 'No').forEach(o => {
        const item = o.STOCKITEMNAME?._ || o.STOCKITEMNAME || '';
        const qty = cleanQty(o.ACTUALQTY?._ || o.ACTUALQTY);
        const rate = cleanRate(o.RATE?._ || o.RATE);
        const batch = o['BATCHALLOCATIONS.LIST']?.BATCHNAME?._ || o['BATCHALLOCATIONS.LIST']?.BATCHNAME || '';
        const godown = o['BATCHALLOCATIONS.LIST']?.GODOWNNAME?._ || o['BATCHALLOCATIONS.LIST']?.GODOWNNAME || '';
        if (item) {
          console.log(`  🔻 CONSUMPTION (OUT) : ${item} | Qty: ${qty} | Rate: ${rate} | Batch: ${batch} | Godown: ${godown}`);
        }
      });
    }

    // Parse Inward lines (Production)
    const inList = v['INVENTORYENTRIESIN.LIST'] || v['ALLINVENTORYENTRIES.LIST'];
    if (inList) {
      const ins = Array.isArray(inList) ? inList : [inList];
      ins.filter(i => i.ISDEEMEDPOSITIVE === 'Yes' || i.ISDEEMEDPOSITIVE?._ === 'Yes').forEach(i => {
        const item = i.STOCKITEMNAME?._ || i.STOCKITEMNAME || '';
        const qty = cleanQty(i.ACTUALQTY?._ || i.ACTUALQTY);
        const rate = cleanRate(i.RATE?._ || i.RATE);
        const batch = i['BATCHALLOCATIONS.LIST']?.BATCHNAME?._ || i['BATCHALLOCATIONS.LIST']?.BATCHNAME || '';
        const godown = i['BATCHALLOCATIONS.LIST']?.GODOWNNAME?._ || i['BATCHALLOCATIONS.LIST']?.GODOWNNAME || '';
        if (item) {
          console.log(`  🟢 PRODUCTION  (IN)  : ${item} | Qty: ${qty} | Rate: ${rate} | Batch: ${batch} | Godown: ${godown}`);
        }
      });
    }
    console.log('');
  });
  console.log('========================================================================\n');
}

// -------------------------------------------------------------
// MAIN EXECUTION FLOW
// -------------------------------------------------------------
async function run() {
  const ts = Date.now().toString().slice(-4);
  const sessionTag = `SES-${ts}`;
  const matName = 'Laser Encoder';
  const rate = 2550;
  const unit = 'Nos';

  // Generate 6 distinct random dates in March (March 1 - March 31, 2026) in realistic progression
  const baseDays = [3, 7, 12, 16, 21, 27];
  // Add slight random offset while keeping within March (1-31)
  const randomMarchDays = baseDays.map((d, i) => {
    const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const day = Math.min(Math.max(d + jitter, i * 4 + 2), 31);
    return `202603${String(day).padStart(2, '0')}`;
  });

  console.log(`Executing Tally actions with Random March 2026 Dates: ${randomMarchDays.join(', ')}`);

  // 1. RDC Store Dispatch: Gokul Shirgaon Godown Transfer (Barcode: 02910004)
  await executeRdcDispatch({
    transactionId: `TXN-RDC-${ts}`,
    materialName: matName,
    barcode: '02910004',
    quantity: 1,
    rate,
    unit,
    fromGodown: 'GOKUL SHIRGAON',
    toGodown: 'Adesh Bhongale',
    voucherDate: randomMarchDays[0],
    sessionTag,
  });

  // 2. Split Material: Autofill Stock Journal
  // Source: 1 unit [02910004]
  // Destination: 2 barcodes [Old: 02910004] + [New: 123456]
  await executeSplitMaterial({
    parentBarcode: '02910004',
    newBarcode: '123456',
    materialName: matName,
    godown: 'Adesh Bhongale',
    rate,
    unit,
    reason: `Splitting Laser Encoder into parent retained unit and new field unit`,
    voucherDate: randomMarchDays[1],
    sessionTag,
  });

  // 3. Exchange Defective Material: Autofill Stock Journal
  // Source: 1 unit [02910004] ➔ Destination: 1 unit [1234567]
  await executeExchangeMaterial({
    oldBarcode: '02910004',
    newBarcode: '1234567',
    materialName: matName,
    godown: 'Adesh Bhongale',
    rate,
    unit,
    warrantyReason: `Optical sensor defect RMA replacement`,
    voucherDate: randomMarchDays[2],
    sessionTag,
  });

  // 4. Merge Material: Autofill Stock Journal
  // Source: [123456] + [1234567] ➔ Destination: Merged [12345678]
  await executeMergeMaterial({
    childBarcodes: ['123456', '1234567'],
    mergedBarcode: '12345678',
    materialName: matName,
    godown: 'Adesh Bhongale',
    rate,
    unit,
    reason: `Merging active barcodes into combined project master lot`,
    voucherDate: randomMarchDays[3],
    sessionTag,
  });

  // 5. Custody Transfer: Gokul Shirgaon Godown Transfer
  // Barcode [12345678] (1 Unit: Adesh Bhongale -> Akshay Kusale)
  await executeTransferMaterial({
    barcode: '12345678',
    materialName: matName,
    fromGodown: 'Adesh Bhongale',
    toGodown: 'Akshay Kusale',
    rate,
    unit,
    reason: `Handing over merged Laser Encoder to onsite engineer Akshay Kusale`,
    voucherDate: randomMarchDays[4],
    sessionTag,
  });

  // 6. Return Material: Gokul Shirgaon Godown Transfer
  // Barcode [12345678] (1 Unit: Akshay Kusale -> GOKUL SHIRGAON)
  await executeReturnMaterial({
    barcode: '12345678',
    materialName: matName,
    fromGodown: 'Akshay Kusale',
    toGodown: 'GOKUL SHIRGAON',
    condition: 'good',
    rate,
    unit,
    reason: `Onsite work complete, returning remaining Laser Encoder to warehouse`,
    voucherDate: randomMarchDays[5],
    sessionTag,
  });

  // 7. Fetch all created vouchers from Tally Prime and output clean 6-voucher report
  await fetchAndReportAllVouchers(sessionTag);
}

run();
