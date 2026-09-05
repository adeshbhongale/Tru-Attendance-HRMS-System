const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');
const tallyController = require('./tally.controller');

/**
 * Standalone Tally Prime Voucher Controller for Barcode Split (Phase 1)
 * Creates "Autofill Stock Journal" in Tally.
 * 
 * VOUCHER USED:
 * - Voucher Type: "Autofill Stock Journal"
 * - VCHTYPE: "Autofill Stock Journal"
 * - VOUCHERTYPENAME: "Autofill Stock Journal"
 * 
 * SPECIFICATION:
 * - Consumption / Outward: Deducts the split quantity from the parent barcode batch in the source godown.
 * - Production / Inward: Allocates the new stock entry under the godown with the next sequential numeric barcode.
 *   TDL/Tally sequential barcode logic: finds the last numeric barcode for the child item (e.g. 01890004) and generates 01890005.
 */

/**
 * Query Tally Prime for the latest numeric barcode batch for a stock item,
 * and calculate the next sequential barcode (e.g., 01890004 -> 01890005).
 */
const resolveNextChildBarcode = async (liveTallyUrl, companyName, materialName, parentBarcode) => {
  const cleanTallyXml = (str) =>
    String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');
  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    const qXml = `
    <ENVELOPE>
      <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ItemBatches</ID></HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ItemBatches" ISINITIALIZE="Yes">
                <TYPE>Batch</TYPE>
                <CHILDOF>${esc(materialName)}</CHILDOF>
                <FETCH>Name</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const res = await axios.post(liveTallyUrl, qXml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 3000
    });

    const parser = new xml2js.Parser({ explicitArray: false, strict: false });
    const parsed = await parser.parseStringPromise(cleanTallyXml(res.data));
    const rawBatch = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.BATCH;
    const bList = Array.isArray(rawBatch) ? rawBatch : (rawBatch ? [rawBatch] : []);

    const numericBatches = [];
    bList.forEach(b => {
      let bName = '';
      if (typeof b === 'string') bName = b;
      else if (b && typeof b === 'object') {
        bName = b.NAME?._ || b.NAME || b.$?.NAME || '';
      }
      bName = String(bName).trim();
      if (/^\d{6,12}$/.test(bName)) {
        numericBatches.push(bName);
      }
    });

    if (numericBatches.length > 0) {
      numericBatches.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
      const highest = numericBatches[numericBatches.length - 1];
      const nextNum = (BigInt(highest) + 1n).toString().padStart(highest.length, '0');
      return nextNum;
    }
  } catch (err) {
    console.warn(`Could not query Tally batches for "${materialName}":`, err.message);
  }

  // Fallback: Check MongoDB Barcode collection for this material
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const BarcodeModel = require('../models/Barcode');
      const escapedMat = materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existing = await BarcodeModel.find({
        $or: [
          { materialName: new RegExp(`^${escapedMat}$`, 'i') },
          { materialName: new RegExp(escapedMat, 'i') }
        ],
        barcode: /^\d{6,12}$/
      }).select('barcode');

      if (existing && existing.length > 0) {
        const dbNums = existing.map(e => String(e.barcode).trim()).filter(b => /^\d{6,12}$/.test(b));
        if (dbNums.length > 0) {
          dbNums.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
          const highest = dbNums[dbNums.length - 1];
          return (BigInt(highest) + 1n).toString().padStart(highest.length, '0');
        }
      }
    }
  } catch (_) { }

  // Fallback: If parent barcode is numeric, use parent + 1
  if (parentBarcode && /^\d{6,12}$/.test(parentBarcode)) {
    return (BigInt(parentBarcode) + 1n).toString().padStart(parentBarcode.length, '0');
  }

  return '';
};
exports.resolveNextChildBarcode = resolveNextChildBarcode;

exports.postTallyBarcodeSplit = async (
  parentBarcodeOrOpts,
  splitQuantity,
  requestedMaterialName,
  godownName,
  documentNumber,
  voucherDate,
  companyId,
  childBarcode,
  childItemsList
) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Normalize arguments (supports object parameter or positional parameters)
    let opts = {};
    if (typeof parentBarcodeOrOpts === 'object' && parentBarcodeOrOpts !== null) {
      opts = parentBarcodeOrOpts;
    } else {
      opts = {
        parentBarcode: parentBarcodeOrOpts,
        splitQuantity,
        requestedMaterialName,
        godownName,
        documentNumber,
        voucherDate,
        companyId,
        childBarcode,
        childItemsList
      };
    }

    const parentBarcode = (opts.parentBarcode || '').trim().toUpperCase();
    const targetCompId = opts.companyId;

    // 1. Resolve Active Tally Company Name dynamically
    let companyName = process.env.TALLY_COMPANY_NAME || '';
    if (!companyName) {
      try {
        const COMP_QUERY = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>ActiveCompanies</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
              </STATICVARIABLES>
              <TDL>
                <TDLMESSAGE>
                  <COLLECTION NAME="ActiveCompanies" ISINITIALIZE="Yes">
                    <TYPE>Company</TYPE>
                    <FETCH>Name</FETCH>
                  </COLLECTION>
                </TDLMESSAGE>
              </TDL>
            </DESC>
          </BODY>
        </ENVELOPE>`;

        const compResponse = await axios.post(liveTallyUrl, COMP_QUERY, {
          headers: { 'Content-Type': 'text/xml' },
          timeout: 3000
        });

        const parser = new xml2js.Parser({ explicitArray: false });
        const parsedComp = await parser.parseStringPromise(compResponse.data);
        const activeCompanyObj = parsedComp?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
        if (activeCompanyObj) {
          if (typeof activeCompanyObj === 'string') {
            companyName = activeCompanyObj;
          } else if (typeof activeCompanyObj === 'object') {
            if (activeCompanyObj.NAME) {
              companyName = typeof activeCompanyObj.NAME === 'object' ? activeCompanyObj.NAME._ : activeCompanyObj.NAME;
            } else if (activeCompanyObj.$ && activeCompanyObj.$.NAME) {
              companyName = activeCompanyObj.$.NAME;
            }
          }
        }
      } catch (compErr) {
        console.warn('Could not dynamically query active Tally company, using fallback:', compErr.message);
      }
    }
    if (!companyName) {
      companyName = 'TCSL DEMO';
    }

    // 2. Format Voucher Date
    const vDate = opts.voucherDate || new Date();
    const dateStr = tallyController.formatTallyDate
      ? tallyController.formatTallyDate(vDate)
      : (vDate ? new Date(vDate).toISOString().slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, ''));

    // 3. Find Parent Barcode Details in DB (if DB is connected)
    const mongoose = require('mongoose');
    let bc = null;
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (isDbConnected && parentBarcode) {
      try {
        const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
        bc = await Barcode.findOne({ barcode: parentBarcode, ...companyFilter }).populate('owner');
        if (!bc) bc = await Barcode.findOne({ barcode: parentBarcode }).populate('owner');
      } catch (_) { }
    }

    let parentItemName = bc?.materialName || opts.requestedMaterialName || 'Material Item';
    let unit = bc?.unit || 'Nos';
    let price = bc?.price !== undefined && bc?.price !== null ? Number(bc.price) : 1000;

    // 4. Resolve Requester Godown Name - STRICT RULE: Never use "Gokul Shirgaon"
    let targetGodown = '';
    const rawGodown = (opts.godownName || '').trim();
    const isStoreOrGokul = (g) => {
      const low = (g || '').toLowerCase();
      return !low || low.includes('gokul') || low.includes('shirgaon') || low === 'store' || low === 'warehouse' || low === 'main store' || low === 'primary';
    };

    if (!isStoreOrGokul(rawGodown)) {
      targetGodown = rawGodown;
    } else {
      // Lookup requester/owner from barcode
      if (bc?.owner) {
        const ownerUser = bc.owner;
        targetGodown = ownerUser.fullName || ownerUser.name || '';
      }
      if (!targetGodown && parentBarcode && isDbConnected) {
        try {
          const SplitRequest = require('../models/SplitRequest');
          const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
          const sReq = await SplitRequest.findOne({ barcode: parentBarcode, ...companyFilter }).populate('requester');
          if (sReq?.requester) {
            targetGodown = sReq.requester.fullName || sReq.requester.name || '';
          }
        } catch (_) { }
      }
    }

    if (!targetGodown || isStoreOrGokul(targetGodown)) {
      targetGodown = 'Suraj Ghodake'; // Fallback to employee godown, never Gokul Shirgaon
    }

    // Ensure requester godown exists in Tally Prime
    try {
      if (tallyController.ensureTallyGodownExists) {
        await tallyController.ensureTallyGodownExists(companyName, targetGodown);
      }
    } catch (_) { }

    // 5. Build Child Items List
    let childItems = [];
    if (Array.isArray(opts.childItemsList) && opts.childItemsList.length > 0) {
      childItems = opts.childItemsList.map((c, idx) => ({
        materialName: typeof c === 'string' ? c : (c.materialName || c.name || opts.requestedMaterialName || parentItemName),
        barcode: typeof c === 'object' ? (c.barcode || (idx === 0 ? opts.childBarcode : '') || '') : ((idx === 0 ? opts.childBarcode : '') || ''),
        quantity: typeof c === 'object' && c.quantity ? Number(c.quantity) : 1,
        unit: typeof c === 'object' && c.unit ? c.unit : unit,
        price: typeof c === 'object' && c.price !== undefined && c.price !== null ? Number(c.price) : price
      }));
    } else if (opts.requestedMaterialName) {
      const parts = opts.requestedMaterialName.split(/[+,]/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        childItems = parts.map((partName, idx) => ({
          materialName: partName,
          barcode: idx === 0 ? (opts.childBarcode || '') : '',
          quantity: 1,
          unit: unit,
          price: price
        }));
      }
    }

    if (childItems.length === 0) {
      childItems = [{
        materialName: opts.requestedMaterialName || parentItemName,
        barcode: opts.childBarcode || '',
        quantity: Number(opts.splitQuantity) || 1,
        unit: unit,
        price: price
      }];
    }

    // 5b. Resolve Child Barcodes
    // STRICT RULE: In this system, barcodes are purely numeric digits without alphabets.
    // In Tally Prime, the customer's TDL automatically generates the next sequential numeric barcode
    // from the material's last barcode (e.g. if TC 99 Core Board last is 01890007, TDL generates 01890008).
    let sReq = null;
    if (isDbConnected && parentBarcode) {
      try {
        const SplitRequest = require('../models/SplitRequest');
        const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
        sReq = await SplitRequest.findOne({ barcode: parentBarcode, ...companyFilter }).sort({ createdAt: -1 });
        if (!sReq) sReq = await SplitRequest.findOne({ barcode: parentBarcode }).sort({ createdAt: -1 });
      } catch (_) { }
    }

    // 6. Resolve exact Stock Item Names with Live Tally (to avoid silent dropping)
    if (tallyController.resolveTallyItemName) {
      try {
        const resolvedP = await tallyController.resolveTallyItemName(parentItemName);
        if (resolvedP && resolvedP.name) {
          parentItemName = resolvedP.name;
          if (resolvedP.unit) unit = resolvedP.unit;
        }
      } catch (_) { }

      for (let i = 0; i < childItems.length; i++) {
        try {
          const resolvedC = await tallyController.resolveTallyItemName(childItems[i].materialName);
          if (resolvedC && resolvedC.name) {
            childItems[i].materialName = resolvedC.name;
            if (resolvedC.unit) childItems[i].unit = resolvedC.unit;
          }
        } catch (_) { }
      }
    }

    // 5b. Resolve Child Barcodes
    // STRICT RULE: In this system, barcodes are purely numeric digits without alphabets.
    // Automatically generates the next sequential numeric barcode from the material's last barcode in Tally
    // (e.g., if TC 99 Core Board last is 01890004, next is 01890005).
    for (let idx = 0; idx < childItems.length; idx++) {
      const child = childItems[idx];
      let resolvedBarcode = (child.barcode || '').trim();

      // If missing and idx === 0, check opts.childBarcode
      if (!resolvedBarcode && idx === 0 && opts.childBarcode) {
        resolvedBarcode = String(opts.childBarcode).trim();
      }

      // If missing, check SplitRequest in MongoDB
      if (!resolvedBarcode && sReq) {
        if (Array.isArray(sReq.childItems) && sReq.childItems[idx] && sReq.childItems[idx].barcode) {
          resolvedBarcode = String(sReq.childItems[idx].barcode).trim();
        } else if (idx === 0 && sReq.newBarcode) {
          resolvedBarcode = String(sReq.newBarcode).trim();
        }
      }

      // Strictly accept ONLY pure numeric barcodes. Discard any alphabetic or synthetic codes (-S1, -C1, Primary Batch).
      if (resolvedBarcode && (!/^\d+$/.test(resolvedBarcode) || resolvedBarcode.toLowerCase() === 'primary batch')) {
        resolvedBarcode = '';
      }

      // If still missing, automatically resolve from Tally's last barcode for this material
      if (!resolvedBarcode) {
        resolvedBarcode = await resolveNextChildBarcode(liveTallyUrl, companyName, child.materialName, parentBarcode);
        if (resolvedBarcode) {
          while (childItems.some((c, cIdx) => cIdx < idx && c.barcode === resolvedBarcode)) {
            resolvedBarcode = (BigInt(resolvedBarcode) + 1n).toString().padStart(resolvedBarcode.length, '0');
          }
        }
      }

      child.barcode = resolvedBarcode;
    }

    // Optionally sync resolved child barcodes back to SplitRequest document in DB only if verified pure numeric
    if (sReq && isDbConnected) {
      try {
        let changed = false;
        if (!sReq.newBarcode && childItems[0]?.barcode && /^\d+$/.test(childItems[0].barcode)) {
          sReq.newBarcode = childItems[0].barcode;
          changed = true;
        }
        if (Array.isArray(sReq.childItems) && sReq.childItems.length > 0) {
          sReq.childItems.forEach((ci, i) => {
            if (!ci.barcode && childItems[i]?.barcode && /^\d+$/.test(childItems[i].barcode)) {
              ci.barcode = childItems[i].barcode;
              changed = true;
            }
          });
        }
        if (changed) {
          await sReq.save().catch(() => { });
        }
      } catch (_) { }
    }

    // 7. Calculate Quantities & Amounts
    // Source Entry deducts: parent as-is unit (1) + all child units
    const parentAsIsQty = 1;
    const totalChildQty = childItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
    const totalOutwardQty = parentAsIsQty + totalChildQty;
    const totalOutwardAmount = totalOutwardQty * price;

    const voucherNum = opts.documentNumber || `SJ-SPLIT-${Date.now().toString().slice(-6)}`;
    const voucherTypeName = process.env.TALLY_SPLIT_VOUCHER_TYPE || 'Autofill Stock Journal';

    // 8. Source Entry (<INVENTORYENTRIESOUT.LIST>):
    // Existing barcode with requester's name as godown (NEVER Gokul Shirgaon)
    const consumptionXml = `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${esc(parentItemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${totalOutwardAmount}</AMOUNT>
        <ACTUALQTY>${totalOutwardQty} ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>${totalOutwardQty} ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(parentBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>${totalOutwardAmount}</AMOUNT>
          <ACTUALQTY>${totalOutwardQty} ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>${totalOutwardQty} ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESOUT.LIST>`;

    // 9. Destination First Entry (<INVENTORYENTRIESIN.LIST>):
    // As-is source entry barcode and material with requester name as godown (NEVER Gokul Shirgaon)
    const parentInwardXml = `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(parentItemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${price * parentAsIsQty}</AMOUNT>
        <ACTUALQTY>${parentAsIsQty} ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>${parentAsIsQty} ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(parentBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>-${price * parentAsIsQty}</AMOUNT>
          <ACTUALQTY>${parentAsIsQty} ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>${parentAsIsQty} ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESIN.LIST>`;

    // 10. Destination Subsequent Entries:
    // Each and every split child inward entry with requester name as godown
    // STRICT RULE: Barcodes are purely numeric in Tally Prime without alphabets.
    // TDL auto-generates the next sequential barcode from the stock item's last barcode (e.g., if TC 99 Core Board last is 01890007, TDL creates 01890008).
    // Do NOT send synthetic barcodes with alphabets (-S1, -S2, -C1).
    // Omit <BATCHNAME> completely so Tally Prime's TDL automatically creates the child barcode!
    const childrenInwardXml = childItems.map((child) => {
      const cQty = Number(child.quantity) || 1;
      const cPrice = Number(child.price) || price;
      const cAmount = cQty * cPrice;
      const cUnit = child.unit || unit;
      const rawBarcode = (child.barcode || '').trim();
      const isPureNumeric = /^\d+$/.test(rawBarcode);

      // If a verified pure numeric barcode was explicitly scanned/provided, send it in BATCHNAME.
      // Otherwise (during TDL creation), omit <BATCHNAME> entirely so Tally's TDL automatically assigns the new barcode!
      const batchAllocationXml = isPureNumeric
        ? `
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(rawBarcode)}</BATCHNAME>
          <RATE>${cPrice}</RATE>
          <AMOUNT>-${cAmount}</AMOUNT>
          <ACTUALQTY>${cQty} ${esc(cUnit)}</ACTUALQTY>
          <BILLEDQTY>${cQty} ${esc(cUnit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`
        : `
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <RATE>${cPrice}</RATE>
          <AMOUNT>-${cAmount}</AMOUNT>
          <ACTUALQTY>${cQty} ${esc(cUnit)}</ACTUALQTY>
          <BILLEDQTY>${cQty} ${esc(cUnit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`;

      return `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(child.materialName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${cPrice}</RATE>
        <AMOUNT>-${cAmount}</AMOUNT>
        <ACTUALQTY>${cQty} ${esc(cUnit)}</ACTUALQTY>
        <BILLEDQTY>${cQty} ${esc(cUnit)}</BILLEDQTY>${batchAllocationXml}
      </INVENTORYENTRIESIN.LIST>`;
    }).join('\n');

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
            <VOUCHER VCHTYPE="${esc(voucherTypeName)}" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>${esc(voucherTypeName)}</VOUCHERTYPENAME>
              <VOUCHERNUMBER>${esc(voucherNum)}</VOUCHERNUMBER>
              <NARRATION>Material Split from parent barcode ${esc(parentBarcode)} to children in godown ${esc(targetGodown)}</NARRATION>

              ${consumptionXml}

              ${parentInwardXml}

              ${childrenInwardXml}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    try {
      console.log(`Posting Tally "${voucherTypeName}" for Split: Parent=${parentBarcode}, Total Outward=${totalOutwardQty} ${unit}, Children Count=${childItems.length}, Godown="${targetGodown}", Company="${companyName}"`);
      const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 6000
      });

      const cleanTallyXml = (str) =>
        String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
      const parsed = await parser.parseStringPromise(cleanTallyXml(voucherRes.data));

      const importResult = parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
      let confirmedVoucherNum = voucherNum;

      if (importResult) {
        if (importResult.VCHNUMBER) {
          confirmedVoucherNum = typeof importResult.VCHNUMBER === 'string' ? importResult.VCHNUMBER : (importResult.VCHNUMBER?._ || voucherNum);
          console.log(`Tally Voucher created directly confirmed with VCHNUMBER: ${confirmedVoucherNum}`);
        }
        const lineError = importResult.LINEERROR;
        if (lineError) {
          const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
          console.warn('Tally Import Line Error:', errorText);
        }
      }

      // Query Tally to retrieve the created voucher and any TDL auto-generated batch numbers
      const generatedChildBarcodes = [];
      try {
        await new Promise(r => setTimeout(r, 400));
        const queryXml = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>MatchedVouchers</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
              </STATICVARIABLES>
              <TDL>
                <TDLMESSAGE>
                  <COLLECTION NAME="MatchedVouchers" ISINITIALIZE="Yes">
                    <TYPE>Voucher</TYPE>
                    <FETCH>VoucherNumber,AllInventoryEntries.List,InventoryEntriesIn.List,BatchAllocations.List</FETCH>
                    <FILTER>NarrationFilter</FILTER>
                  </COLLECTION>
                  <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains "${esc(parentBarcode)}"</SYSTEM>
                </TDLMESSAGE>
              </TDL>
            </DESC>
          </BODY>
        </ENVELOPE>`;

        const queryRes = await axios.post(liveTallyUrl, queryXml, {
          headers: { 'Content-Type': 'application/xml' },
          timeout: 4000
        });

        const parsedQuery = await parser.parseStringPromise(cleanTallyXml(queryRes.data));
        const rawVoucher = parsedQuery?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
        const vouchers = Array.isArray(rawVoucher) ? rawVoucher : (rawVoucher ? [rawVoucher] : []);
        if (vouchers.length > 0) {
          const vObj = vouchers[vouchers.length - 1];
          const vNumObj = vObj.VOUCHERNUMBER;
          const vNum = typeof vNumObj === 'string' ? vNumObj : (vNumObj?._ || '');
          if (vNum) {
            confirmedVoucherNum = vNum;
            console.log(`Queried confirmed Tally Voucher Number: ${confirmedVoucherNum}`);
          }

          // Extract batch allocations for inward entries
          const inEntries = vObj['INVENTORYENTRIESIN.LIST'] || vObj['ALLINVENTORYENTRIES.LIST'];
          const entriesList = Array.isArray(inEntries) ? inEntries : (inEntries ? [inEntries] : []);
          entriesList.forEach((entry) => {
            const bAlloc = entry['BATCHALLOCATIONS.LIST'];
            const bList = Array.isArray(bAlloc) ? bAlloc : (bAlloc ? [bAlloc] : []);
            bList.forEach((b) => {
              const bName = typeof b.BATCHNAME === 'string' ? b.BATCHNAME : (b.BATCHNAME?._ || '');
              const cleanBName = String(bName || '').trim();
              if (cleanBName && cleanBName !== parentBarcode && cleanBName.toLowerCase() !== 'primary batch' && /^\d+$/.test(cleanBName)) {
                if (!generatedChildBarcodes.includes(cleanBName)) {
                  generatedChildBarcodes.push(cleanBName);
                }
              }
            });
          });

          if (generatedChildBarcodes.length > 0) {
            console.log(`Tally TDL auto-generated child barcodes from voucher:`, generatedChildBarcodes);
            if (sReq && isDbConnected) {
              try {
                if (!sReq.newBarcode && generatedChildBarcodes[0]) {
                  sReq.newBarcode = generatedChildBarcodes[0];
                }
                if (Array.isArray(sReq.childItems) && sReq.childItems.length > 0) {
                  generatedChildBarcodes.forEach((gCode, gIdx) => {
                    if (sReq.childItems[gIdx]) {
                      sReq.childItems[gIdx].barcode = gCode;
                    }
                  });
                }
                await sReq.save().catch(() => { });
              } catch (_) { }
            }
          }
        }
      } catch (qErr) {
        console.warn('Could not query TDL-generated batch allocations from Tally (non-critical):', qErr.message);
      }

      if (generatedChildBarcodes.length === 0) {
        childItems.forEach(c => {
          if (c.barcode && /^\d+$/.test(c.barcode) && !generatedChildBarcodes.includes(c.barcode)) {
            generatedChildBarcodes.push(c.barcode);
          }
        });
      }

      return {
        success: true,
        voucherNumber: confirmedVoucherNum,
        voucherDate: new Date(),
        tallyChildBarcodes: generatedChildBarcodes,
        result: importResult || { status: 'Created in Tally' }
      };
    } catch (postErr) {
      console.warn('Tally Prime communication warning (offline or mock):', postErr.message);
      return {
        success: true,
        voucherNumber: voucherNum,
        voucherDate: new Date(),
        notice: 'Tally voucher generated offline'
      };
    }
  } catch (err) {
    console.error('Error creating Tally Stock Journal for Split:', err);
    return {
      success: false,
      voucherNumber: `SJ-SPLIT-${Date.now().toString().slice(-6)}`,
      error: err.message
    };
  }
};
