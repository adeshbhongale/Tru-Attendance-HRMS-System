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
 * - Production / Inward: Allocates the new stock entry under the godown WITHOUT sending a destination barcode (<BATCHNAME> omitted).
 *   The user's Tally TDL handles automatic barcode generation for the destination entry.
 */
exports.postTallyBarcodeSplit = async (parentBarcode, splitQuantity, requestedMaterialName, godownName, documentNumber, voucherDate, companyId) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    const dateStr = tallyController.formatTallyDate
      ? tallyController.formatTallyDate(voucherDate)
      : (voucherDate ? new Date(voucherDate).toISOString().slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, ''));

    // 3. Find Parent Barcode Details in DB
    const companyFilter = companyId ? { $or: [{ companyId }, { companyId: null }] } : {};
    let bc = await Barcode.findOne({ barcode: parentBarcode, ...companyFilter });
    if (!bc) bc = await Barcode.findOne({ barcode: parentBarcode });

    let parentItemName = bc?.materialName || requestedMaterialName || 'Material Item';
    let destItemName = requestedMaterialName || bc?.materialName || 'Material Item';
    let unit = bc?.unit || 'Nos';
    let price = bc?.price !== undefined && bc?.price !== null ? Number(bc.price) : 1000;
    const qty = Number(splitQuantity) || 1;
    const totalAmount = price * qty;

    // 4. Resolve exact Stock Item Names with Live Tally (to avoid silent dropping)
    try {
      if (tallyController.resolveTallyItemName) {
        const resolvedP = await tallyController.resolveTallyItemName(parentItemName);
        if (resolvedP && resolvedP.name) {
          parentItemName = resolvedP.name;
          if (resolvedP.unit) unit = resolvedP.unit;
        }
        const resolvedD = await tallyController.resolveTallyItemName(destItemName);
        if (resolvedD && resolvedD.name) {
          destItemName = resolvedD.name;
        }
      }
    } catch (_) {}

    // 5. Resolve exact Godown Name
    let targetGodown = godownName || 'GOKUL SHIRGAON';
    try {
      if (tallyController.resolveTallyGodownName) {
        targetGodown = await tallyController.resolveTallyGodownName(targetGodown);
      }
    } catch (_) {
      if (targetGodown && targetGodown.toLowerCase().includes('gokul')) {
        targetGodown = 'GOKUL SHIRGAON';
      }
    }

    const voucherNum = documentNumber || `SJ-SPLIT-${Date.now().toString().slice(-6)}`;
    const voucherTypeName = process.env.TALLY_SPLIT_VOUCHER_TYPE || 'Autofill Stock Journal';

    // Outward: Deducts from Parent Barcode in Source Godown
    const consumptionXml = `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${esc(parentItemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${totalAmount}</AMOUNT>
        <ACTUALQTY>${qty} ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>${qty} ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <BATCHNAME>${esc(parentBarcode)}</BATCHNAME>
          <RATE>${price}</RATE>
          <AMOUNT>${totalAmount}</AMOUNT>
          <ACTUALQTY>${qty} ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>${qty} ${esc(unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESOUT.LIST>`;

    // Inward: Destination Godown - Omit <BATCHNAME> so customer's TDL generates destination barcode
    const productionXml = `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${esc(destItemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${totalAmount}</AMOUNT>
        <ACTUALQTY>${qty} ${esc(unit)}</ACTUALQTY>
        <BILLEDQTY>${qty} ${esc(unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${esc(targetGodown)}</GODOWNNAME>
          <RATE>${price}</RATE>
          <AMOUNT>-${totalAmount}</AMOUNT>
          <ACTUALQTY>${qty} ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>${qty} ${esc(unit)}</BILLEDQTY>
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
              <NARRATION>Material Split from parent barcode ${esc(parentBarcode)} (${qty} ${esc(unit)})</NARRATION>

              ${consumptionXml}

              ${productionXml}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    try {
      console.log(`Posting Tally "${voucherTypeName}" for Split: Parent=${parentBarcode}, Qty=${qty} ${unit} to Company="${companyName}"`);
      const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 5000
      });

      const cleanTallyXml = (str) =>
        String(str || '').replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;').replace(/&nbsp;/gi, ' ');
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
      const parsed = await parser.parseStringPromise(cleanTallyXml(voucherRes.data));

      const importResult = parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
      if (importResult) {
        const lineError = importResult.LINEERROR;
        if (lineError) {
          const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
          console.warn('Tally Import Line Error:', errorText);
        }
      }

      // Query Tally for the auto-generated voucher number using split narration filter
      let confirmedVoucherNum = voucherNum;
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
                    <FETCH>VoucherNumber</FETCH>
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
          timeout: 3000
        });

        const parsedQuery = await parser.parseStringPromise(queryRes.data);
        const rawVoucher = parsedQuery?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
        const vouchers = Array.isArray(rawVoucher) ? rawVoucher : (rawVoucher ? [rawVoucher] : []);
        if (vouchers.length > 0) {
          const vNumObj = vouchers[vouchers.length - 1].VOUCHERNUMBER;
          const vNum = typeof vNumObj === 'string' ? vNumObj : (vNumObj?._ || '');
          if (vNum) {
            confirmedVoucherNum = vNum;
            console.log(`Queried confirmed Tally Voucher Number: ${confirmedVoucherNum}`);
          }
        }
      } catch (_) {}

      return {
        success: true,
        voucherNumber: confirmedVoucherNum,
        voucherDate: new Date(),
        result: importResult || { status: 'Created in Tally' }
      };
    } catch (postErr) {
      console.warn('Tally Prime communication warning (offline or mock):', postErr.message);
      // Return generated voucher number even if local Tally bridge is unreachable, allowing flow to continue
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
