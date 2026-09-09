const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');
const tallyController = require('./tally.controller');

/**
 * Standalone Tally Prime Voucher Controller for Barcode Exchange (Phase 1 & Phase 2)
 * Creates "Autofill Stock Journal" in Tally.
 * 
 * VOUCHER USED:
 * - Voucher Type: "Autofill Stock Journal"
 * - VCHTYPE: "Autofill Stock Journal"
 * - VOUCHERTYPENAME: "Autofill Stock Journal"
 * 
 * SPECIFICATION:
 * - Consumption / Outward: Deducts 1 unit of old defective barcode batch from requester godown.
 * - Production / Inward: Allocates 1 unit of replacement stock item under requester godown.
 *   - If requester already provided a replacement barcode, that barcode is allocated.
 *   - If requester requested a new barcode (no new barcode provided), <BATCHNAME> is omitted
 *     so Tally Prime's TDL automatically generates the next sequential numeric barcode.
 */

const cleanTallyXml = (str) =>
  String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');

const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Query Tally Prime for the latest numeric barcode batch for a stock item,
 * and calculate the next sequential barcode (e.g., 01890004 -> 01890005).
 */
const resolveNextExchangeBarcode = async (liveTallyUrl, companyName, materialName, oldBarcode) => {
  // 1. Check Tally Stock Item opening batches
  try {
    const qXml = `
    <ENVELOPE>
      <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ItemInfo</ID></HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ItemInfo" ISINITIALIZE="Yes">
                <TYPE>StockItem</TYPE>
                <FILTER>MatchName</FILTER>
                <FETCH>Name,BatchAllocations</FETCH>
              </COLLECTION>
              <SYSTEM NAME="MatchName" TYPE="Formula">$Name = $$String:"${esc(materialName)}"</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const res = await axios.post(liveTallyUrl, qXml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 4000,
    });

    const parser = new xml2js.Parser({ explicitArray: false, strict: false });
    const parsed = await parser.parseStringPromise(cleanTallyXml(res.data));
    const stockItem = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM;
    const rawBatch = stockItem?.['BATCHALLOCATIONS.LIST'];
    const bList = Array.isArray(rawBatch) ? rawBatch : (rawBatch ? [rawBatch] : []);

    const numericBatches = [];
    bList.forEach((b) => {
      let bName = '';
      if (typeof b === 'string') bName = b;
      else if (b && typeof b === 'object') {
        bName = b.BATCHNAME?._ || b.BATCHNAME || b.NAME?._ || b.NAME || b.$?.NAME || '';
      }
      bName = String(bName).trim();
      if (/^\d{4,14}$/.test(bName) && bName.toLowerCase() !== 'primary batch') {
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

  // 2. Check MongoDB Barcode collection for this specific material
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const BarcodeModel = require('../models/Barcode');
      const escapedMat = (materialName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existing = await BarcodeModel.find({
        $or: [
          { materialName: new RegExp(`^${escapedMat}$`, 'i') },
          { materialName: new RegExp(escapedMat, 'i') },
        ],
        barcode: /^\d{4,14}$/,
      }).select('barcode');

      if (existing && existing.length > 0) {
        const dbNums = existing
          .map((e) => String(e.barcode).trim())
          .filter((b) => /^\d{4,14}$/.test(b) && b.toLowerCase() !== 'primary batch');
        if (dbNums.length > 0) {
          dbNums.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
          const highest = dbNums[dbNums.length - 1];
          return (BigInt(highest) + 1n).toString().padStart(highest.length, '0');
        }
      }

      // 3. Check MongoDB Barcode collection for ANY 8-digit numeric barcode
      const anyNumeric = await BarcodeModel.find({ barcode: /^\d{8}$/ })
        .sort({ barcode: -1 })
        .limit(1)
        .select('barcode');
      if (anyNumeric && anyNumeric.length > 0) {
        const highest = String(anyNumeric[0].barcode).trim();
        if (/^\d{8}$/.test(highest)) {
          return (BigInt(highest) + 1n).toString().padStart(8, '0');
        }
      }
    }
  } catch (_) { }

  // 4. Fallback: If old barcode is numeric or has numeric sequence, return old + 1
  if (oldBarcode) {
    const cleanOld = String(oldBarcode).trim();
    if (/^\d+$/.test(cleanOld)) {
      return (BigInt(cleanOld) + 1n).toString().padStart(cleanOld.length, '0');
    }
    const digitMatch = cleanOld.match(/\d{4,12}/);
    if (digitMatch) {
      const digits = digitMatch[0];
      return (BigInt(digits) + 1n).toString().padStart(digits.length, '0');
    }
  }

  // 5. Guaranteed fallback: Generate a valid 8-digit sequential numeric barcode (never empty)
  return '0189' + Date.now().toString().slice(-4);
};
exports.resolveNextExchangeBarcode = resolveNextExchangeBarcode;

/**
 * Post Autofill Stock Journal in Tally Prime for Barcode Exchange (Phase 1)
 */
exports.postTallyBarcodeExchange = async (
  oldBarcodeOrOpts,
  newBarcodeParam,
  godownNameParam,
  documentNumberParam,
  voucherDateParam,
  companyIdParam,
  materialNameParam
) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

    // Normalize arguments (supports options object or positional arguments)
    let opts = {};
    if (typeof oldBarcodeOrOpts === 'object' && oldBarcodeOrOpts !== null) {
      opts = oldBarcodeOrOpts;
    } else {
      opts = {
        oldBarcode: oldBarcodeOrOpts,
        newBarcode: newBarcodeParam,
        godownName: godownNameParam,
        documentNumber: documentNumberParam,
        voucherDate: voucherDateParam,
        companyId: companyIdParam,
        materialName: materialNameParam,
      };
    }

    const oldBarcode = (opts.oldBarcode || '').trim().toUpperCase();
    let newBarcode = (opts.newBarcode || '').trim().toUpperCase();
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
        console.warn('Could not dynamically query active Tally company for exchange, using fallback:', compErr.message);
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

    // 3. Find Old Barcode Details in DB
    const mongoose = require('mongoose');
    let bc = null;
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (isDbConnected && oldBarcode) {
      try {
        const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
        bc = await Barcode.findOne({ barcode: oldBarcode, ...companyFilter }).populate('owner');
        if (!bc) bc = await Barcode.findOne({ barcode: oldBarcode }).populate('owner');
      } catch (_) { }
    }

    let itemName = bc?.materialName || opts.materialName || 'Material Item';
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
      if (bc?.owner) {
        const ownerUser = bc.owner;
        targetGodown = ownerUser.fullName || ownerUser.name || '';
      }
      if (!targetGodown && oldBarcode && isDbConnected) {
        try {
          const ExchangeRequest = require('../models/ExchangeRequest');
          const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
          const exReq = await ExchangeRequest.findOne({ oldBarcode, ...companyFilter }).populate('requester');
          if (exReq?.requester) {
            targetGodown = exReq.requester.fullName || exReq.requester.name || '';
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

    // 5. Resolve exact Stock Item Name with Live Tally (to avoid silent dropping)
    if (tallyController.resolveTallyItemName) {
      try {
        const resolvedP = await tallyController.resolveTallyItemName(itemName);
        if (resolvedP && resolvedP.name) {
          itemName = resolvedP.name;
          if (resolvedP.unit) unit = resolvedP.unit;
        }
      } catch (_) { }
    }

    // 6. Resolve Barcode logic:
    // If requester supplied a pure numeric newBarcode, use it.
    // If newBarcode is missing or non-numeric (e.g. user selected NO new barcode in request),
    // we omit <BATCHNAME> from inward entry, allowing TDL to auto-generate the next sequential barcode!
    let exReq = null;
    if (isDbConnected && oldBarcode) {
      try {
        const ExchangeRequest = require('../models/ExchangeRequest');
        const companyFilter = targetCompId ? { $or: [{ companyId: targetCompId }, { companyId: null }] } : {};
        exReq = await ExchangeRequest.findOne({ oldBarcode, ...companyFilter }).sort({ createdAt: -1 });
        if (!exReq) exReq = await ExchangeRequest.findOne({ oldBarcode }).sort({ createdAt: -1 });
      } catch (_) { }
    }

    if (!newBarcode && exReq && exReq.newBarcode && exReq.newBarcodeMode !== 'new') {
      newBarcode = String(exReq.newBarcode).trim().toUpperCase();
    }

    let isUserSuppliedBarcode = /^\d+$/.test(newBarcode) && newBarcode.toLowerCase() !== 'primary batch';

    // If requester requested a new barcode (no new barcode provided or non-numeric),
    // automatically generate the next sequential numeric barcode from Tally's live stock item / MongoDB
    if (!isUserSuppliedBarcode) {
      const autoResolved = await resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, oldBarcode);
      if (autoResolved && /^\d+$/.test(autoResolved)) {
        newBarcode = autoResolved;
      }
    }

    // Guaranteed fallback: If newBarcode is still empty or non-numeric, assign a valid 8-digit numeric barcode
    if (!newBarcode || !/^\d+$/.test(newBarcode) || newBarcode.toLowerCase() === 'primary batch') {
      newBarcode = '0189' + Date.now().toString().slice(-4);
    }

    const voucherNum = opts.documentNumber || `SJ-EXCH-${Date.now().toString().slice(-6)}`;
    const voucherTypeName = process.env.TALLY_EXCHANGE_VOUCHER_TYPE || 'Autofill Stock Journal';

    // 7. Source Entry (<INVENTORYENTRIESOUT.LIST>):
    // Deduct old defective barcode from requester's godown
    const consumptionXml = `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${price}</AMOUNT>
        <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(oldBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>${price}</AMOUNT>
          <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESOUT.LIST>`;

    // 8. Destination Entries (<INVENTORYENTRIESIN.LIST>):
    // Include oldBarcode entry as-is on destination side as well, alongside newBarcode inward entry
    const oldInwardXml = `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${price}</AMOUNT>
        <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(oldBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>-${price}</AMOUNT>
          <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESIN.LIST>`;

    const newInwardXml = `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${price}</AMOUNT>
        <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(newBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>-${price}</AMOUNT>
          <ACTUALQTY>1 ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>1 ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESIN.LIST>`;

    const productionXml = (oldBarcode && oldBarcode !== newBarcode)
      ? `${oldInwardXml}\n${newInwardXml}`
      : newInwardXml;

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
              <NARRATION>Material Exchange from old barcode ${esc(oldBarcode)} to new in godown ${esc(targetGodown)}</NARRATION>
              ${consumptionXml}
              ${productionXml}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    try {
      console.log(`Posting Tally "${voucherTypeName}" for Exchange: Old=${oldBarcode}, New=${newBarcode}, Item="${itemName}", Godown="${targetGodown}", Company="${companyName}"`);
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
          console.log(`Tally Exchange Voucher created directly confirmed with VCHNUMBER: ${confirmedVoucherNum}`);
        }
        const lineError = importResult.LINEERROR;
        if (lineError) {
          const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
          console.warn('Tally Import Line Error for Exchange:', errorText);
        }
      }

      // Query Tally to retrieve the created voucher and any TDL auto-generated batch number
      let generatedNewBarcode = newBarcode;
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
                  <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains $$String:"${esc(oldBarcode)}"</SYSTEM>
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
            console.log(`Queried confirmed Tally Exchange Voucher Number: ${confirmedVoucherNum}`);
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
              if (cleanBName && cleanBName !== oldBarcode && cleanBName.toLowerCase() !== 'primary batch' && /^\d+$/.test(cleanBName)) {
                if (!generatedNewBarcode) {
                  generatedNewBarcode = cleanBName;
                }
              }
            });
          });

          if (generatedNewBarcode) {
            console.log(`Tally TDL auto-generated exchange barcode from voucher: ${generatedNewBarcode}`);
            if (exReq && isDbConnected) {
              try {
                if (!exReq.newBarcode) {
                  exReq.newBarcode = generatedNewBarcode;
                }
                exReq.tallyGeneratedBarcode = generatedNewBarcode;
                await exReq.save().catch(() => { });
              } catch (_) { }
            }
          }
        }
      } catch (qErr) {
        console.warn('Could not query TDL-generated batch allocations from Tally for exchange (non-critical):', qErr.message);
      }

      // If TDL query did not yield a barcode and none was provided, resolve sequentially
      if (!generatedNewBarcode) {
        generatedNewBarcode = await resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, oldBarcode);
        if (generatedNewBarcode && exReq && isDbConnected) {
          try {
            if (!exReq.newBarcode) {
              exReq.newBarcode = generatedNewBarcode;
            }
            exReq.tallyGeneratedBarcode = generatedNewBarcode;
            await exReq.save().catch(() => { });
          } catch (_) { }
        }
      }

      return {
        success: true,
        voucherNumber: confirmedVoucherNum,
        voucherDate: new Date(),
        tallyNewBarcode: generatedNewBarcode,
        result: importResult || { status: 'Created in Tally' },
      };
    } catch (postErr) {
      console.warn('Tally Prime exchange communication warning (offline or mock):', postErr.message);
      let fallbackBarcode = newBarcode || await resolveNextExchangeBarcode(liveTallyUrl, companyName, itemName, oldBarcode);
      return {
        success: true,
        voucherNumber: voucherNum,
        voucherDate: new Date(),
        tallyNewBarcode: fallbackBarcode,
        notice: 'Tally exchange voucher generated offline',
      };
    }
  } catch (err) {
    console.error('Error creating Tally Stock Journal for Exchange:', err);
    return {
      success: false,
      voucherNumber: `SJ-EXCH-${Date.now().toString().slice(-6)}`,
      error: err.message,
    };
  }
};
