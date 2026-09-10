const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');
const tallyController = require('./tally.controller');

/**
 * Standalone Tally Prime Voucher Controller for Barcode Merge (Phase 1 & Phase 2)
 * Creates "Autofill Stock Journal" in Tally.
 *
 * SPECIFICATION:
 * - Consumption / Outward: Deducts 1 unit per child barcode batch from requester godown.
 * - Production / Inward: Allocates combined qty under parent barcode in requester godown.
 *   - If parentBarcodeMode === 'existing': uses the user-selected parent barcode as BATCHNAME.
 *   - If parentBarcodeMode === 'new': auto-generates next sequential numeric barcode via TDL.
 */

const cleanTallyXml = (str) =>
  String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');

const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Post Autofill Stock Journal in Tally Prime for Barcode Merge
 * @param {Object} opts - Options object
 * @param {string[]} opts.childBarcodes - Array of child barcode strings being merged
 * @param {string} opts.parentBarcode - The parent barcode (existing selected or will be auto-generated)
 * @param {string} opts.parentBarcodeMode - 'existing' or 'new'
 * @param {string} opts.godownName - Requester godown name
 * @param {string} opts.materialName - Material/stock item name
 * @param {Date} opts.voucherDate - Voucher date
 * @param {string} opts.companyId - Company ID for multi-tenant
 * @returns {{ success: boolean, voucherNumber: string, tallyNewBarcode: string }}
 */
exports.postTallyBarcodeMerge = async (opts) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

    const childBarcodes = opts.childBarcodes || [];
    let parentBarcode = (opts.parentBarcode || '').trim().toUpperCase();
    const parentBarcodeMode = opts.parentBarcodeMode || 'existing';
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
          timeout: 3000,
        });

        const parser = new xml2js.Parser({ explicitArray: false, strict: false });
        const parsedComp = await parser.parseStringPromise(cleanTallyXml(compResponse.data));
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
        console.warn('Could not dynamically query active Tally company for merge, using fallback:', compErr.message);
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

    // 3. Find child barcode details in DB
    const mongoose = require('mongoose');
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    let childBarcodeDocs = [];
    if (isDbConnected && childBarcodes.length > 0) {
      try {
        const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
        childBarcodeDocs = await Barcode.find({ barcode: { $in: childBarcodes }, ...companyFilter }).populate('owner');
        if (childBarcodeDocs.length === 0) {
          childBarcodeDocs = await Barcode.find({ barcode: { $in: childBarcodes } }).populate('owner');
        }
      } catch (_) { }
    }

    // Determine item name from first child barcode or opts
    let itemName = opts.materialName || (childBarcodeDocs[0]?.materialName) || 'Material Item';
    let unit = childBarcodeDocs[0]?.unit || 'Nos';
    let price = childBarcodeDocs[0]?.price !== undefined && childBarcodeDocs[0]?.price !== null ? Number(childBarcodeDocs[0].price) : 1000;

    // 4. Resolve Requester Godown Name - STRICT RULE: Never use "Gokul Shirgaon" for store
    let targetGodown = '';
    const rawGodown = (opts.godownName || '').trim();
    const isStoreOrGokul = (g) => {
      const low = (g || '').toLowerCase();
      return !low || low.includes('gokul') || low.includes('shirgaon') || low === 'store' || low === 'warehouse' || low === 'main store' || low === 'primary';
    };

    if (!isStoreOrGokul(rawGodown)) {
      targetGodown = rawGodown;
    } else {
      if (childBarcodeDocs[0]?.owner) {
        const ownerUser = childBarcodeDocs[0].owner;
        targetGodown = ownerUser.fullName || ownerUser.name || '';
      }
    }

    if (!targetGodown || isStoreOrGokul(targetGodown)) {
      targetGodown = 'Suraj Ghodake';
    }

    // Ensure requester godown exists in Tally Prime
    try {
      if (tallyController.ensureTallyGodownExists) {
        await tallyController.ensureTallyGodownExists(companyName, targetGodown);
      }
    } catch (_) { }

    // 5. Resolve exact Stock Item Name with Live Tally
    if (tallyController.resolveTallyItemName) {
      try {
        const resolvedP = await tallyController.resolveTallyItemName(itemName);
        if (resolvedP && resolvedP.name) {
          itemName = resolvedP.name;
          if (resolvedP.unit) unit = resolvedP.unit;
        }
      } catch (_) { }
    }

    // 6. Resolve parent barcode for production entry
    if (parentBarcodeMode === 'new' && !parentBarcode) {
      try {
        const tallyExchangeController = require('./tallyExchange.controller');
        if (tallyExchangeController.resolveNextExchangeBarcode) {
          const autoResolved = await tallyExchangeController.resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, childBarcodes[0]);
          if (autoResolved && /^\d+$/.test(autoResolved)) {
            parentBarcode = autoResolved;
          }
        }
      } catch (_) { }

      if (!parentBarcode || !/^\d+$/.test(parentBarcode)) {
        parentBarcode = '0189' + Date.now().toString().slice(-4);
      }

      while (childBarcodes.includes(parentBarcode)) {
        parentBarcode = (BigInt(parentBarcode) + 1n).toString().padStart(parentBarcode.length, '0');
      }
    }

    const voucherNum = opts.documentNumber || `SJ-MERGE-${Date.now().toString().slice(-6)}`;
    const voucherTypeName = process.env.TALLY_MERGE_VOUCHER_TYPE || 'Autofill Stock Journal';

    // 7. Build Consumption Entries for each child barcode
    let consumptionXml = '';
    for (const childBc of childBarcodes) {
      const childDoc = childBarcodeDocs.find(d => d.barcode === childBc);
      let childItemName = childDoc?.materialName || itemName;
      let childUnit = childDoc?.unit || unit;
      let childPrice = childDoc?.price !== undefined && childDoc?.price !== null ? Number(childDoc.price) : price;

      if (tallyController.resolveTallyItemName) {
        try {
          const resolved = await tallyController.resolveTallyItemName(childItemName);
          if (resolved && resolved.name) {
            childItemName = resolved.name;
            if (resolved.unit) childUnit = resolved.unit;
          }
        } catch (_) { }
      }

      let resolvedGodown = targetGodown;
      if (tallyController.resolveTallyGodownName) {
        try {
          resolvedGodown = await tallyController.resolveTallyGodownName(childDoc?.godown || targetGodown);
        } catch (_) { }
      }

      consumptionXml += `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${esc(childItemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${childPrice}</RATE>
        <AMOUNT>${childPrice}</AMOUNT>
        <ACTUALQTY>1 ${esc(childUnit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(childUnit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(resolvedGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(childBc)}</BATCHNAME>
          <RATE>${childPrice}</RATE>
          <AMOUNT>${childPrice}</AMOUNT>
          <ACTUALQTY>1 ${esc(childUnit)}</ACTUALQTY>
          <BILLEDQTY>1 ${esc(childUnit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESOUT.LIST>`;
    }

    // 8. Build Production Entry for the parent barcode
    let totalPrice = childBarcodeDocs.reduce((sum, d) => sum + (d.price !== undefined && d.price !== null ? Number(d.price) : price), 0);
    if (totalPrice === 0) totalPrice = price * childBarcodes.length;

    let resolvedDestGodown = targetGodown;
    if (tallyController.resolveTallyGodownName) {
      try {
        resolvedDestGodown = await tallyController.resolveTallyGodownName(targetGodown);
      } catch (_) { }
    }

    const productionXml = `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${totalPrice}</RATE>
        <AMOUNT>-${totalPrice}</AMOUNT>
        <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(resolvedDestGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(parentBarcode)}</BATCHNAME>
          <RATE>${totalPrice}</RATE>
          <AMOUNT>-${totalPrice}</AMOUNT>
          <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESIN.LIST>`;

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
              <NARRATION>Merged barcodes (${childBarcodes.join(', ')}) into parent barcode ${esc(parentBarcode)} in godown ${esc(targetGodown)}</NARRATION>
              ${consumptionXml}
              ${productionXml}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    try {
      console.log(`Posting Tally "${voucherTypeName}" for Merge: Children=[${childBarcodes.join(',')}], Parent=${parentBarcode}, Item="${itemName}", Godown="${targetGodown}", Company="${companyName}"`);
      const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 6000,
      });

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
      const parsed = await parser.parseStringPromise(cleanTallyXml(voucherRes.data));

      const importResult = parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
      let confirmedVoucherNum = voucherNum;

      if (importResult) {
        if (importResult.VCHNUMBER) {
          confirmedVoucherNum = typeof importResult.VCHNUMBER === 'string' ? importResult.VCHNUMBER : (importResult.VCHNUMBER?._ || voucherNum);
        }
        const lineError = importResult.LINEERROR;
        if (lineError) {
          const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
          console.warn('Tally Import Line Error for Merge:', errorText);
        }
        const errorsCount = parseInt(importResult.ERRORS || '0', 10);
        const exceptionsCount = parseInt(importResult.EXCEPTIONS || '0', 10);
        if (errorsCount > 0 || exceptionsCount > 0) {
          throw new Error(`Tally import failed with ${errorsCount} errors and ${exceptionsCount} exceptions.`);
        }
      }

      // Query Tally to retrieve the created voucher and confirm barcode
      let generatedNewBarcode = parentBarcode;
      try {
        await new Promise((r) => setTimeout(r, 400));
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
                  <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains $$String:"${esc(childBarcodes[0])}"</SYSTEM>
                </TDLMESSAGE>
              </TDL>
            </DESC>
          </BODY>
        </ENVELOPE>`;

        const queryRes = await axios.post(liveTallyUrl, queryXml, {
          headers: { 'Content-Type': 'application/xml' },
          timeout: 4000,
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
          }

          const inEntries = vObj['INVENTORYENTRIESIN.LIST'] || vObj['ALLINVENTORYENTRIES.LIST'];
          const entriesList = Array.isArray(inEntries) ? inEntries : (inEntries ? [inEntries] : []);
          entriesList.forEach((entry) => {
            const bAlloc = entry['BATCHALLOCATIONS.LIST'];
            const bList = Array.isArray(bAlloc) ? bAlloc : (bAlloc ? [bAlloc] : []);
            bList.forEach((b) => {
              const bName = typeof b.BATCHNAME === 'string' ? b.BATCHNAME : (b.BATCHNAME?._ || '');
              const cleanBName = String(bName || '').trim();
              if (cleanBName && !childBarcodes.includes(cleanBName) && cleanBName.toLowerCase() !== 'primary batch' && /^\d+$/.test(cleanBName)) {
                generatedNewBarcode = cleanBName;
              }
            });
          });
        }
      } catch (qErr) {
        console.warn('Could not query TDL-generated batch allocations from Tally for merge (non-critical):', qErr.message);
      }

      if (parentBarcodeMode === 'new' && !generatedNewBarcode) {
        try {
          const tallyExchangeController = require('./tallyExchange.controller');
          if (tallyExchangeController.resolveNextExchangeBarcode) {
            generatedNewBarcode = await tallyExchangeController.resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, childBarcodes[0]);
          }
        } catch (_) { }
      }

      return {
        success: true,
        voucherNumber: confirmedVoucherNum,
        voucherDate: new Date(),
        tallyNewBarcode: generatedNewBarcode,
      };
    } catch (postErr) {
      console.warn('Tally Prime merge communication warning (offline or mock):', postErr.message);
      let fallbackBarcode = parentBarcode;
      if (parentBarcodeMode === 'new' && !fallbackBarcode) {
        try {
          const tallyExchangeController = require('./tallyExchange.controller');
          if (tallyExchangeController.resolveNextExchangeBarcode) {
            fallbackBarcode = await tallyExchangeController.resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, childBarcodes[0]);
          }
        } catch (_) { }
        if (!fallbackBarcode) fallbackBarcode = '0189' + Date.now().toString().slice(-4);
        while (childBarcodes.includes(fallbackBarcode)) {
          fallbackBarcode = (BigInt(fallbackBarcode) + 1n).toString().padStart(fallbackBarcode.length, '0');
        }
      }
      return {
        success: true,
        voucherNumber: voucherNum,
        voucherDate: new Date(),
        tallyNewBarcode: fallbackBarcode,
        notice: 'Tally merge voucher generated offline',
      };
    }
  } catch (err) {
    console.error('Error creating Tally Stock Journal for Merge:', err);
    return {
      success: false,
      voucherNumber: `SJ-MERGE-${Date.now().toString().slice(-6)}`,
      error: err.message,
    };
  }
};
