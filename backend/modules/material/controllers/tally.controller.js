const axios = require('axios');
const xml2js = require('xml2js');

// XML Query to find the active company in Tally Prime
const COMPANY_QUERY_XML = `
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

// Helper to parse Tally numeric strings (handles commas, currencies/units e.g., "1,200.00 Nos" or "1200.00/Nos")
function parseTallyNumber(str) {
  if (!str) return 0;
  // Trim first, remove commas, then split by slash/whitespace to extract numeric part
  const cleaned = str.toString().trim().replace(/,/g, '').split('/')[0].trim().split(/\s+/)[0];
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Helper to format any date into Tally Prime's standard YYYYMMDD string format (Gold License compatible)
function formatTallyDate(inputDate) {
  if (!inputDate) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
  if (typeof inputDate === 'string' && /^\d{8}$/.test(inputDate)) {
    return inputDate;
  }
  const d = new Date(inputDate);
  if (isNaN(d.getTime())) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
exports.formatTallyDate = formatTallyDate;

// XML Request to export Stock Item Name, Units, Closing Balance, Opening Balance, Opening Rate, and Closing Rate from Tally Prime
const buildLiveStockXML = (companyName) => {
  const escapedCompanyName = companyName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>LiveStockItems</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVCURRENTCOMPANY>${escapedCompanyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="LiveStockItems" ISINITIALIZE="Yes">
              <TYPE>StockItem</TYPE>
              <FETCH>Name, BaseUnits, ClosingBalance, OpeningBalance, OpeningRate, ClosingRate, BatchAllocations</FETCH>
            </COLLECTION>
          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>`;
};

exports.getLiveInventory = async (req, res) => {
  const { search = '' } = req.query;
  const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

  try {
    // 1. Check active companies first
    let companyName = null;
    try {
      const compResponse = await axios.post(liveTallyUrl, COMPANY_QUERY_XML, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 3000 // 3 seconds timeout for active company check
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(compResponse.data);

      const rawCompanies = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
      if (rawCompanies) {
        const companies = Array.isArray(rawCompanies) ? rawCompanies : [rawCompanies];
        if (companies.length > 0 && companies[0]) {
          const comp = companies[0];
          companyName = typeof comp.NAME === 'string'
            ? comp.NAME
            : comp.NAME?._ || comp.NAME?.$?.NAME;
        }
      }
    } catch (err) {
      console.error('Tally active company query failed:', err.message);
      return res.json({
        success: false,
        materials: [],
        message: 'Tally Prime server is offline or unreachable.'
      });
    }

    if (!companyName) {
      return res.json({
        success: false,
        materials: [],
        message: 'No company is currently open/selected in Tally Prime.'
      });
    }

    // 2. Query stock items from Tally Prime (with active company or direct collection)
    const xmlPayload = companyName ? buildLiveStockXML(companyName.trim()) : `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LiveStockItems</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LiveStockItems" ISINITIALIZE="Yes">
                <TYPE>StockItem</TYPE>
                <FETCH>Name, BaseUnits, ClosingBalance, OpeningBalance, OpeningRate, ClosingRate, Parent, Category, BatchAllocations</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const response = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 8000,
    });

    // Parse Tally's XML response into JSON with XML entity sanitization
    const rawXml = typeof response.data === 'string' ? response.data : String(response.data);
    const sanitizedXml = rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
    const parsedData = await parser.parseStringPromise(sanitizedXml);

    const rawItems = parsedData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || [];
    const stockItems = Array.isArray(rawItems) ? rawItems : [rawItems];

    // Map and sanitize the records
    let materials = stockItems
      .filter((item) => item && (item.NAME || item.$.NAME))
      .map((item) => {
        let name = '';
        if (typeof item.NAME === 'string') {
          name = item.NAME;
        } else if (typeof item.NAME === 'object' && item.NAME._) {
          name = item.NAME._;
        } else if (item.$ && item.$.NAME) {
          name = item.$.NAME;
        }
        name = name.trim();

        // Calculate total stock from ClosingBalance/OpeningBalance or batch allocations
        let stock = 0;
        let mainBalanceStr = item.CLOSINGBALANCE || item.OPENINGBALANCE;
        if (mainBalanceStr) {
          const bStr = typeof mainBalanceStr === 'object' ? mainBalanceStr._ : mainBalanceStr;
          stock = Math.abs(parseTallyNumber(bStr));
        }

        if (stock === 0 && item['BATCHALLOCATIONS.LIST']) {
          const rawAllocations = item['BATCHALLOCATIONS.LIST'];
          const allocations = Array.isArray(rawAllocations) ? rawAllocations : [rawAllocations];
          allocations.forEach(alloc => {
            let qtyStr = alloc.CLOSINGBALANCE || alloc.OPENINGBALANCE || alloc.ACTUALQTY || alloc.BILLEDQTY;
            if (qtyStr) {
              const valStr = typeof qtyStr === 'object' ? qtyStr._ : qtyStr;
              stock += Math.abs(parseTallyNumber(valStr));
            }
          });
        }

        // Get unit (fallback if Not Applicable)
        let unit = 'Nos';
        if (item.BASEUNITS) {
          const rawUnit = typeof item.BASEUNITS === 'object' ? (item.BASEUNITS._ || 'Nos') : item.BASEUNITS;
          if (rawUnit && rawUnit.trim() !== '' && rawUnit.trim() !== 'Not Applicable') {
            unit = rawUnit.trim();
          }
        }

        // Get price (ClosingRate fallback to OpeningRate)
        let price = 0;
        let hasClosingRate = false;
        if (item.CLOSINGRATE) {
          const rawClosingRate = typeof item.CLOSINGRATE === 'object' ? item.CLOSINGRATE._ : item.CLOSINGRATE;
          if (rawClosingRate && rawClosingRate.trim() !== '') {
            price = parseTallyNumber(rawClosingRate);
            hasClosingRate = true;
          }
        }
        if (!hasClosingRate && item.OPENINGRATE) {
          const rawOpeningRate = typeof item.OPENINGRATE === 'object' ? item.OPENINGRATE._ : item.OPENINGRATE;
          if (rawOpeningRate && rawOpeningRate.trim() !== '') {
            price = parseTallyNumber(rawOpeningRate);
          }
        }

        // Get group (Parent) and category
        let group = (item.PARENT && (typeof item.PARENT === 'object' ? item.PARENT._ : item.PARENT) || '').trim();
        group = group.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        if (group === 'Not Applicable') {
          group = '';
        }

        let category = (item.CATEGORY && (typeof item.CATEGORY === 'object' ? item.CATEGORY._ : item.CATEGORY) || '').trim();
        category = category.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        if (category === 'Not Applicable') {
          category = '';
        }

        return {
          name: name.trim(),
          unit: unit,
          stock: stock,
          price: price,
          group: group,
          category: category,
        };
      })
      .filter((item) => item.name.length > 0);

    // Filter items matching the user search keyword (case-insensitive) in name, group, or category
    if (search.trim()) {
      const query = search.toLowerCase();
      materials = materials.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.group.toLowerCase().includes(query) ||
          m.category.toLowerCase().includes(query)
      );
    }

    // Return successfully with the materials
    res.json({
      success: true,
      materials: materials.slice(0, 1000),
      message: `Successfully loaded materials from company: "${companyName.trim()}"`
    });
  } catch (error) {
    console.error('Error fetching live Tally inventory:', error.message);
    res.json({
      success: false,
      materials: [],
      message: 'Failed to retrieve inventory from Tally Prime.',
      error: error.message
    });
  }
};

exports.createTallyStockJournal = async (transactionId, destinationGodown, materials, voucherDate) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return;

    // 1. Fetch active company
    const COMPANY_QUERY_XML = `
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

    const compResponse = await axios.post(liveTallyUrl, COMPANY_QUERY_XML, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 3000
    });

    const parser = new xml2js.Parser({ explicitArray: false });
    const parsedComp = await parser.parseStringPromise(compResponse.data);
    const activeCompanyObj = parsedComp?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
    let companyName = '';
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

    if (!companyName) {
      console.warn('No active Tally company found. Skipping Stock Journal creation.');
      return;
    }

    // 2. Format Date (YYYYMMDD) - Use actual transaction / voucher date
    const dateStr = formatTallyDate(voucherDate);
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Resolve Destination Godown (matching Tally Employee Godown or creating it)
    const resolvedDest = await resolveTallyGodownName(destinationGodown || 'GOKUL SHIRGAON', companyName);
    const destinationGodownEsc = esc(resolvedDest);

    // 3. Build XML voucher lines
    let consumptionLines = '';
    let productionLines = '';

    for (const mat of materials) {
      let rawMatName = mat.name || mat.materialName;
      let matUnit = mat.unit || 'pcs';
      try {
        const resolved = await resolveTallyItemName(rawMatName);
        if (resolved) {
          rawMatName = resolved.name;
          matUnit = resolved.unit || matUnit;
        }
      } catch (rErr) {
        // fallback
      }

      const name = esc(rawMatName);
      const qty = mat.quantity || 1;
      const unit = esc(matUnit);
      const price = mat.price || 0;
      const amount = qty * price;

      // Map barcodes to Batch Allocations
      const matBarcodes = mat.barcodes || [];
      let batchOutLines = '';
      let batchInLines = '';

      if (matBarcodes.length > 0) {
        matBarcodes.forEach(bcObj => {
          const bcStr = typeof bcObj === 'string' ? bcObj : (bcObj.barcode || '');
          if (bcStr) {
            const escapedBc = esc(bcStr);
            batchOutLines += `
            <BATCHALLOCATIONS.LIST>
              <BATCHNAME>${escapedBc}</BATCHNAME>
              <GODOWNNAME>GOKUL SHIRGAON</GODOWNNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${price}</RATE>
              <AMOUNT>${price}</AMOUNT>
              <ACTUALQTY>1 ${unit}</ACTUALQTY>
              <BILLEDQTY>1 ${unit}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>`;

            batchInLines += `
            <BATCHALLOCATIONS.LIST>
              <BATCHNAME>${escapedBc}</BATCHNAME>
              <GODOWNNAME>${destinationGodownEsc}</GODOWNNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${price}</RATE>
              <AMOUNT>-${price}</AMOUNT>
              <ACTUALQTY>1 ${unit}</ACTUALQTY>
              <BILLEDQTY>1 ${unit}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>`;
          }
        });
      } else {
        // Fallback for requests that do not have barcode items
        batchOutLines = `
        <BATCHALLOCATIONS.LIST>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <GODOWNNAME>GOKUL SHIRGAON</GODOWNNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <RATE>${price}</RATE>
          <AMOUNT>${amount}</AMOUNT>
          <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
          <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`;

        batchInLines = `
        <BATCHALLOCATIONS.LIST>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <GODOWNNAME>${destinationGodownEsc}</GODOWNNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <RATE>${price}</RATE>
          <AMOUNT>-${amount}</AMOUNT>
          <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
          <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`;
      }

      // Source/Consumption (Outward)
      consumptionLines += `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchOutLines}
      </INVENTORYENTRIESOUT.LIST>`;

      // Destination/Production (Inward)
      productionLines += `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchInLines}
      </INVENTORYENTRIESIN.LIST>`;
    }

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
            <SVCURRENTCOMPANY>${companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</SVCURRENTCOMPANY>
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE xmlns:UDF="TallyUDF">
            <VOUCHER VCHTYPE="Gokul Shirgaon Godown Transfer" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>Gokul Shirgaon Godown Transfer</VOUCHERTYPENAME>
              <CLASSNAME>Gokul Shirgaon Godown Transfer</CLASSNAME>
              <DESTINATIONGODOWN>${destinationGodownEsc}</DESTINATIONGODOWN>
              <ISTRANSFER>Yes</ISTRANSFER>
              <NARRATION>Material movement dispatch for transaction ${transactionId}</NARRATION>
              ${productionLines}
              ${consumptionLines}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    console.log(`Posting Tally Gokul Shirgaon Godown Transfer for transaction ${transactionId}...`);
    const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    console.log('Tally Gokul Shirgaon Godown Transfer response:', voucherRes.data);

    // Wait 500ms for Tally to persist and then query for the auto-generated Voucher Number via Narration
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
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
              <SVCURRENTCOMPANY>${companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</SVCURRENTCOMPANY>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="MatchedVouchers" ISINITIALIZE="Yes">
                  <TYPE>Voucher</TYPE>
                  <FETCH>VoucherNumber</FETCH>
                  <FILTER>NarrationFilter</FILTER>
                </COLLECTION>
                <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains "${transactionId}"</SYSTEM>
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
          console.log(`Extracted Tally voucher number for transaction ${transactionId}: ${vNum}`);
          return vNum;
        }
      }
    } catch (queryErr) {
      console.error(`Failed to query voucher number from Tally for transaction ${transactionId}:`, queryErr.message);
    }
  } catch (err) {
    console.error('Failed to post Gokul Shirgaon Godown Transfer to Tally:', err.message);
  }
};

/**
 * Create a Tally "Gokul Shirgaon Godown Transfer" voucher with configurable source and destination godowns.
 * Used for:
 *   - Barcode Transfer: source = sender's godown (fromUser), destination = recipient's godown (toUser)
 *   - Return to Store: source = material holder's godown (fromUser), destination = GOKUL SHIRGAON
 *
 * @param {string} narrationId - Unique identifier for the narration (e.g. transfer._id or return._id)
 * @param {string} flowType - 'transfer' or 'return'
 * @param {string} sourceGodown - The godown name to move stock OUT of
 * @param {string} destinationGodown - The godown name to move stock IN to
 * @param {Array} materials - Array of { name, quantity, unit, price, barcodes }
 * @returns {string|undefined} - The Tally voucher number if successfully created
 */
exports.createTallyGodownTransfer = async (narrationId, flowType, sourceGodown, destinationGodown, materials, voucherDate) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return;

    // 1. Fetch active company
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
    let companyName = '';
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

    if (!companyName) {
      console.warn(`No active Tally company found. Skipping Godown Transfer for ${flowType} ${narrationId}.`);
      return;
    }

    // 2. Format Date (YYYYMMDD) - Use actual transaction / voucher date
    const dateStr = formatTallyDate(voucherDate);

    // 3. Escape XML helper
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const resolvedSource = await resolveTallyGodownName(sourceGodown || 'GOKUL SHIRGAON');
    const resolvedDest = await resolveTallyGodownName(destinationGodown || 'GOKUL SHIRGAON');
    const sourceGodownEsc = esc(resolvedSource);
    const destinationGodownEsc = esc(resolvedDest);

    // 4. Build XML voucher lines
    let consumptionLines = '';
    let productionLines = '';
    let allInventoryLines = '';

    for (const mat of materials) {
      let rawMatName = mat.name;
      let matUnit = mat.unit || 'pcs';
      try {
        const resolved = await resolveTallyItemName(rawMatName);
        if (resolved) {
          rawMatName = resolved.name;
          matUnit = resolved.unit || matUnit;
        }
      } catch (rErr) {
        // fallback
      }

      const name = esc(rawMatName);
      const qty = mat.quantity || 1;
      const unit = esc(matUnit);
      const price = mat.price || 0;
      const amount = qty * price;

      // Map barcodes to Batch Allocations
      const matBarcodes = mat.barcodes || [];
      let batchOutLines = '';
      let batchInLines = '';

      if (matBarcodes.length > 0) {
        matBarcodes.forEach(bcObj => {
          const bcStr = typeof bcObj === 'string' ? bcObj : (bcObj.barcode || '');
          if (bcStr) {
            const escapedBc = esc(bcStr);
            batchOutLines += `
            <BATCHALLOCATIONS.LIST>
              <BATCHNAME>${escapedBc}</BATCHNAME>
              <GODOWNNAME>${sourceGodownEsc}</GODOWNNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${price}</RATE>
              <AMOUNT>${price}</AMOUNT>
              <ACTUALQTY>1 ${unit}</ACTUALQTY>
              <BILLEDQTY>1 ${unit}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>`;

            batchInLines += `
            <BATCHALLOCATIONS.LIST>
              <BATCHNAME>${escapedBc}</BATCHNAME>
              <GODOWNNAME>${destinationGodownEsc}</GODOWNNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${price}</RATE>
              <AMOUNT>-${price}</AMOUNT>
              <ACTUALQTY>1 ${unit}</ACTUALQTY>
              <BILLEDQTY>1 ${unit}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>`;
          }
        });
      } else {
        batchOutLines = `
        <BATCHALLOCATIONS.LIST>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <GODOWNNAME>${sourceGodownEsc}</GODOWNNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <RATE>${price}</RATE>
          <AMOUNT>${amount}</AMOUNT>
          <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
          <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`;

        batchInLines = `
        <BATCHALLOCATIONS.LIST>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <GODOWNNAME>${destinationGodownEsc}</GODOWNNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <RATE>${price}</RATE>
          <AMOUNT>-${amount}</AMOUNT>
          <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
          <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`;
      }

      // Source/Consumption (Outward)
      consumptionLines += `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchOutLines}
      </INVENTORYENTRIESOUT.LIST>`;

      // Destination/Production (Inward)
      productionLines += `
      <INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchInLines}
      </INVENTORYENTRIESIN.LIST>`;

      // ALLINVENTORYENTRIES for Voucher Class Compatibility
      allInventoryLines += `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchOutLines}
      </ALLINVENTORYENTRIES.LIST>
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${price}</RATE>
        <AMOUNT>-${amount}</AMOUNT>
        <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
        <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
        ${batchInLines}
      </ALLINVENTORYENTRIES.LIST>`;
    }

    const narrationText = flowType === 'transfer'
      ? `Barcode transfer by ${sourceGodown} to ${destinationGodown} (ID: ${narrationId})`
      : `Return to store by ${sourceGodown} to ${destinationGodown} (ID: ${narrationId})`;

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
            <VOUCHER VCHTYPE="Gokul Shirgaon Godown Transfer" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>Gokul Shirgaon Godown Transfer</VOUCHERTYPENAME>
              <CLASSNAME>Gokul Shirgaon Godown Transfer</CLASSNAME>
              <DESTINATIONGODOWN>${destinationGodownEsc}</DESTINATIONGODOWN>
              <ISTRANSFER>Yes</ISTRANSFER>
              <NARRATION>${narrationText}</NARRATION>
              ${allInventoryLines}
              ${productionLines}
              ${consumptionLines}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    console.log(`Posting Tally Godown Transfer for ${flowType} ${narrationId}: ${sourceGodown} -> ${destinationGodown}`);
    const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    console.log(`Tally Godown Transfer response for ${flowType} ${narrationId}:`, voucherRes.data);

    // Wait 500ms for Tally to persist, then query for the auto-generated Voucher Number
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
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
                <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains "${narrationId}"</SYSTEM>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>`;

      const queryRes = await axios.post(liveTallyUrl, queryXml, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 6000
      });

      const parsedQuery = await parser.parseStringPromise(queryRes.data);
      const rawVoucher = parsedQuery?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
      const vouchers = Array.isArray(rawVoucher) ? rawVoucher : (rawVoucher ? [rawVoucher] : []);
      if (vouchers.length > 0) {
        const vNumObj = vouchers[vouchers.length - 1].VOUCHERNUMBER;
        const vNum = typeof vNumObj === 'string' ? vNumObj : (vNumObj?._ || '');
        if (vNum) {
          console.log(`Extracted Tally voucher number for ${flowType} ${narrationId}: ${vNum}`);
          return vNum;
        }
      }
    } catch (queryErr) {
      console.error(`Failed to query voucher number from Tally for ${flowType} ${narrationId}:`, queryErr.message);
    }
  } catch (err) {
    console.error(`Failed to post Godown Transfer to Tally for ${flowType}:`, err.message);
  }
};

/**
 * Create a Tally "Autofill Stock Journal" voucher for a split action.
 * Moves 1 unit of parent item out of the requester's godown (source)
 * and produces:
 *   1) 1 unit of parent item with parent barcode under the requester's godown (destination)
 *   2) 1 unit of new item with new child barcode under the requester's godown (destination)
 *
 * @param {string} splitId - Unique split request ID for narration tracking
 * @param {object} parentBc - Parent barcode details { materialName, barcode }
 * @param {object} newBcDoc - Child barcode details { materialName, barcode }
 * @param {object} parentMaterial - Parent material info { unit, price }
 * @param {string} requesterGodown - The godown name where the material holder has the stock
 * @returns {string|undefined} - The Tally voucher number if successfully created
 */
/**
 * Resolves a material name to the closest matching Stock Item name in Tally Prime
 */
const resolveTallyItemName = async (inputName) => {
  if (!inputName) return null;
  const cleanInput = inputName.trim().toLowerCase();

  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return { name: inputName, unit: 'pcs' };

    // 1. Fetch active company name
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
      timeout: 1500
    });

    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const parsedComp = await parser.parseStringPromise(compResponse.data);
    const activeCompanyObj = parsedComp?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
    let companyName = '';
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

    if (!companyName) return { name: inputName, unit: 'pcs' };

    // 2. Fetch all stock items from Tally
    const xmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>StockItemsCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${companyName.trim()}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="StockItemsCollection" ISINITIALIZE="Yes">
                <TYPE>StockItem</TYPE>
                <FETCH>Name, BaseUnits</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const response = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 2000
    });

    const rawXml = typeof response.data === 'string' ? response.data : String(response.data);
    const sanitizedXml = rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    const parsedData = await parser.parseStringPromise(sanitizedXml);
    const rawItems = parsedData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || [];
    const stockItems = Array.isArray(rawItems) ? rawItems : [rawItems];

    const items = stockItems.map(item => {
      let name = '';
      if (item.$ && item.$.NAME) name = item.$.NAME;
      else if (item.NAME) name = typeof item.NAME === 'string' ? item.NAME : (item.NAME._ || '');

      let unit = 'pcs';
      if (item.BASEUNITS) {
        unit = typeof item.BASEUNITS === 'object' ? (item.BASEUNITS._ || 'pcs') : item.BASEUNITS;
        if (unit === 'Not Applicable') unit = 'pcs';
      }
      return { name: name.trim(), unit };
    }).filter(i => i.name);

    // 3. Find matches:
    const normalizedClean = cleanInput.replace(/\s*\([^)]*\)/g, '').trim();

    // Exact match on raw clean input
    const exact = items.find(i => i.name.toLowerCase() === cleanInput);
    if (exact) return exact;

    // Exact match on normalized clean input (without (Nos), (pcs), etc.)
    if (normalizedClean && normalizedClean !== cleanInput) {
      const normExact = items.find(i => i.name.toLowerCase() === normalizedClean);
      if (normExact) return normExact;
    }

    // Prefer TC prefixed items
    const targetName = normalizedClean || cleanInput;
    if (!targetName.startsWith('tc ')) {
      const tcMatch = items.find(i => i.name.toLowerCase() === `tc ${targetName}`);
      if (tcMatch) return tcMatch;
    }

    // Substring match
    const subMatch = items.find(i => i.name.toLowerCase().includes(targetName));
    if (subMatch) return subMatch;

    // Substring reverse match
    const revMatch = items.find(i => targetName.includes(i.name.toLowerCase()));
    if (revMatch) return revMatch;

  } catch (err) {
    console.warn('Failed to resolve stock item name from Tally:', err.message);
  }

  const fallbackClean = inputName.replace(/\s*\([^)]*\)/g, '').trim();
  return { name: fallbackClean || inputName, unit: 'pcs' };
};

exports.resolveTallyItemName = resolveTallyItemName;

const ensureTallyGodownExists = async (companyName, godownName) => {
  if (!godownName || godownName === 'GOKUL SHIRGAON' || godownName === 'Main Location') return;
  const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
  if (!liveTallyUrl) return;

  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const createGodownXml = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Import</TALLYREQUEST>
      <TYPE>Data</TYPE>
      <ID>AllMasters</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName || '')}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
      <DATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GODOWN NAME="${esc(godownName)}" ACTION="Create">
            <NAME>${esc(godownName)}</NAME>
            <PARENT>Primary</PARENT>
          </GODOWN>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  try {
    await axios.post(liveTallyUrl, createGodownXml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 3000
    });
    console.log(`Ensured godown '${godownName}' exists in Tally.`);
  } catch (err) {
    console.warn(`Could not ensure godown '${godownName}' in Tally:`, err.message);
  }
};

exports.ensureTallyGodownExists = ensureTallyGodownExists;

const resolveTallyGodownName = async (inputGodown, companyName) => {
  const defaultGodown = 'GOKUL SHIRGAON';
  if (!inputGodown || typeof inputGodown !== 'string') return defaultGodown;
  const cleanInput = inputGodown.trim();
  if (!cleanInput) return defaultGodown;

  const lower = cleanInput.toLowerCase();
  if (lower.includes('gokul') || lower.includes('shirgaon') || lower === 'store' || lower === 'warehouse') {
    return defaultGodown;
  }

  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return cleanInput;

    const query = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>GodownsCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="GodownsCollection" ISINITIALIZE="Yes">
                <TYPE>Godown</TYPE>
                <FETCH>Name</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const res = await axios.post(liveTallyUrl, query, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });

    const rawXml = typeof res.data === 'string' ? res.data : String(res.data);
    const sanitizedXml = rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    const parser = new xml2js.Parser({ explicitArray: false });
    const parsed = await parser.parseStringPromise(sanitizedXml);
    const rawGodowns = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.GODOWN || [];
    const godownsList = (Array.isArray(rawGodowns) ? rawGodowns : [rawGodowns])
      .map(g => (g.$ && g.$.NAME) || (g.NAME && typeof g.NAME === 'object' ? g.NAME._ : g.NAME) || '')
      .map(n => n.trim())
      .filter(Boolean);

    // 1. Exact match
    const exact = godownsList.find(g => g.toLowerCase() === lower);
    if (exact) return exact;

    // 2. Multi-word match: split input by space (e.g. "Adesh Balasaheb Bhongale" -> words ["adesh", "balasaheb", "bhongale"])
    const words = lower.split(/\s+/).filter(w => w.length >= 2);
    if (words.length >= 2) {
      const firstWord = words[0];
      const lastWord = words[words.length - 1];
      const matchFirstLast = godownsList.find(g => {
        const gLow = g.toLowerCase();
        return gLow.includes(firstWord) && gLow.includes(lastWord);
      });
      if (matchFirstLast) return matchFirstLast;

      const matchSubset = godownsList.find(g => {
        const gWords = g.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
        return gWords.length > 0 && gWords.every(gw => words.includes(gw));
      });
      if (matchSubset) return matchSubset;
    }

    // 3. Single word / partial match
    if (words.length > 0) {
      const matchFirst = godownsList.find(g => g.toLowerCase().includes(words[0]));
      if (matchFirst) return matchFirst;
    }

    // 4. If companyName is provided, attempt to create the godown in Tally Prime
    if (companyName) {
      await ensureTallyGodownExists(companyName, cleanInput);
      return cleanInput;
    }

    console.warn(`Godown '${cleanInput}' not found in Tally. Falling back to '${defaultGodown}'.`);
    return defaultGodown;
  } catch (err) {
    console.warn(`Failed to resolve Tally godown for '${cleanInput}':`, err.message);
    return defaultGodown;
  }
};

exports.resolveTallyGodownName = resolveTallyGodownName;

exports.createTallySplitStockJournal = async (splitId, parentBc, newBcDoc, parentMaterial, requesterGodown, parentGodown, voucherDate) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return;

    // 1. Fetch active company
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
    let companyName = '';
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

    if (!companyName) {
      console.warn(`No active Tally company found. Skipping Split Stock Journal for ${splitId}.`);
      return;
    }

    // 2. Format Date (YYYYMMDD) - Use actual transaction / voucher date
    const dateStr = formatTallyDate(voucherDate);

    // 3. Escape XML helper
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Resolve parent item name using live Tally items list
    let parentTallyName = parentBc.materialName;
    let parentTallyUnit = parentBc.unit || parentMaterial?.unit || 'Nos';
    try {
      const resolvedP = await resolveTallyItemName(parentTallyName);
      if (resolvedP) {
        parentTallyName = resolvedP.name;
        parentTallyUnit = resolvedP.unit || parentTallyUnit;
        console.log(`Resolved live Tally stock item name for parent barcode ${parentBc.barcode}: ${parentTallyName} (${parentTallyUnit})`);
      }
    } catch (err) {
      console.warn(`Failed to resolve Tally item name for parent barcode ${parentBc.barcode}:`, err.message);
    }
    const parentName = esc(parentTallyName);
    const parentBarcode = esc(parentBc.barcode);

    // Resolve child name using live Tally items list to prevent silent dropping in Tally Prime
    let childTallyName = newBcDoc.materialName || parentBc.materialName;
    let childTallyUnit = parentMaterial?.unit || 'pcs';
    try {
      const resolved = await resolveTallyItemName(childTallyName);
      if (resolved) {
        childTallyName = resolved.name;
        childTallyUnit = resolved.unit || childTallyUnit;
        console.log(`Resolved live Tally stock item name for child barcode ${newBcDoc.barcode}: ${childTallyName} (${childTallyUnit})`);
      }
    } catch (err) {
      console.warn(`Failed to resolve Tally item name for child barcode ${newBcDoc.barcode}:`, err.message);
    }
    const childName = esc(childTallyName);
    const childBarcode = esc(newBcDoc.barcode);

    // Parent unit and price details (fallback to child's info if not explicitly set on parentBc)
    const pUnit = esc(parentBc.unit || parentMaterial?.unit || 'Nos');
    const pPrice = parentBc.price !== undefined && parentBc.price !== null ? parentBc.price : (parentMaterial?.price || 0);
    const pAmount = pPrice;

    // Child unit and price details (from frontend form input)
    const cUnit = esc(childTallyUnit);
    const cPrice = parentMaterial?.price || 0;
    const cAmount = cPrice;

    const resolvedParentGodown = await resolveTallyGodownName(parentGodown || 'GOKUL SHIRGAON');
    const resolvedRequesterGodown = await resolveTallyGodownName(requesterGodown || 'GOKUL SHIRGAON');

    const sourceGodown = esc(resolvedParentGodown);
    const destGodownChild = esc(resolvedRequesterGodown);

    // Consumption (Outward): parent barcode consumed (1 unit)
    const consumptionLines = `
    <INVENTORYENTRIESOUT.LIST>
      <STOCKITEMNAME>${parentName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <RATE>${pPrice}</RATE>
      <AMOUNT>${pAmount}</AMOUNT>
      <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${parentBarcode}</BATCHNAME>
        <GODOWNNAME>${sourceGodown}</GODOWNNAME>
        <RATE>${pPrice}</RATE>
        <AMOUNT>${pAmount}</AMOUNT>
        <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESOUT.LIST>`;

    // Production (Inward): parent barcode (1 unit) + child barcode (1 unit) produced
    const productionLines = `
    <INVENTORYENTRIESIN.LIST>
      <STOCKITEMNAME>${parentName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <RATE>${pPrice}</RATE>
      <AMOUNT>-${pAmount}</AMOUNT>
      <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${parentBarcode}</BATCHNAME>
        <GODOWNNAME>${sourceGodown}</GODOWNNAME>
        <RATE>${pPrice}</RATE>
        <AMOUNT>-${pAmount}</AMOUNT>
        <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESIN.LIST>
    <INVENTORYENTRIESIN.LIST>
      <STOCKITEMNAME>${childName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <RATE>${cPrice}</RATE>
      <AMOUNT>-${cAmount}</AMOUNT>
      <ACTUALQTY>1 ${cUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${cUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${childBarcode}</BATCHNAME>
        <GODOWNNAME>${destGodownChild}</GODOWNNAME>
        <RATE>${cPrice}</RATE>
        <AMOUNT>-${cAmount}</AMOUNT>
        <ACTUALQTY>1 ${cUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${cUnit}</BILLEDQTY>
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
            <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
              <NARRATION>Split barcode by ${requesterGodown} from parent ${parentBc.barcode} to child ${newBcDoc.barcode} (splitId: ${splitId})</NARRATION>
              ${productionLines}
              ${consumptionLines}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    console.log(`Posting Tally Autofill Stock Journal for split ${splitId}: ${parentBc.barcode} -> ${newBcDoc.barcode}`);
    const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    console.log(`Tally Autofill Stock Journal response for split ${splitId}:`, voucherRes.data);

    const parsedImport = await parser.parseStringPromise(voucherRes.data);
    const importResult = parsedImport?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
    if (importResult) {
      const lineError = importResult.LINEERROR;
      if (lineError) {
        const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
        throw new Error(errorText);
      }
      const errorsCount = parseTallyNumber(importResult.ERRORS);
      const exceptionsCount = parseTallyNumber(importResult.EXCEPTIONS);
      if (errorsCount > 0 || exceptionsCount > 0) {
        throw new Error(`Tally import failed with ${errorsCount} errors and ${exceptionsCount} exceptions.`);
      }
    }

    // Extract last created voucher ID if present from import metadata as a reliable fallback
    let lastCreatedVchId = '';
    const cmpInfoEx = parsedImport?.ENVELOPE?.BODY?.DESC?.CMPINFOEX;
    if (cmpInfoEx && cmpInfoEx.IDINFO && cmpInfoEx.IDINFO.LASTCREATEDVCHID) {
      lastCreatedVchId = typeof cmpInfoEx.IDINFO.LASTCREATEDVCHID === 'object'
        ? cmpInfoEx.IDINFO.LASTCREATEDVCHID._
        : cmpInfoEx.IDINFO.LASTCREATEDVCHID;
    }

    // Wait 500ms for Tally to persist, then query for the auto-generated Voucher Number
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
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
                <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains "${splitId}"</SYSTEM>
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
          console.log(`Extracted Tally split voucher number for ${splitId}: ${vNum}`);
          return vNum;
        }
      }
    } catch (queryErr) {
      console.error(`Failed to query voucher number from Tally for split ${splitId}:`, queryErr.message);
    }

    // Fallback if import succeeded but the voucher number query timed out or failed
    const fallbackVchNum = lastCreatedVchId ? `Tally-ID-${lastCreatedVchId}` : 'Tally-SUCCESS';
    console.log(`Fallback Tally voucher number assigned: ${fallbackVchNum}`);
    return fallbackVchNum;
  } catch (err) {
    console.error(`Failed to post Split Stock Journal to Tally:`, err.message);
    throw err;
  }
};

exports.createTallyMergeStockJournal = async (mergeId, mergeBarcodeDocs, parentBc, materialInfo, requesterGodown, voucherDate) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return;

    // 1. Fetch active company
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
    let companyName = '';
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

    if (!companyName) {
      console.warn(`No active Tally company found. Skipping Merge Stock Journal for ${mergeId}.`);
      return;
    }

    const dateStr = formatTallyDate(voucherDate);
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Resolve parent item name from Tally if available
    let parentTallyName = materialInfo?.materialName || parentBc.materialName;
    let parentTallyUnit = materialInfo?.unit || parentBc.unit || 'pcs';
    try {
      const resolved = await resolveTallyItemName(parentTallyName);
      if (resolved) {
        parentTallyName = resolved.name;
        parentTallyUnit = resolved.unit || parentTallyUnit;
      }
    } catch (err) {
      console.warn(`Failed to resolve Tally item name for parent barcode ${parentBc.barcode}:`, err.message);
    }
    const parentName = esc(parentTallyName);
    const parentBarcode = esc(parentBc.barcode);
    const pUnit = esc(parentTallyUnit);

    let totalPrice = 0;
    let consumptionLines = '';

    // Build consumption entries (Source) for ALL merged barcodes
    for (const bDoc of mergeBarcodeDocs) {
      let bTallyName = bDoc.materialName;
      let bTallyUnit = bDoc.unit || 'pcs';
      try {
        const resB = await resolveTallyItemName(bTallyName);
        if (resB) {
          bTallyName = resB.name;
          bTallyUnit = resB.unit || bTallyUnit;
        }
      } catch (err) { }

      const bName = esc(bTallyName);
      const bCode = esc(bDoc.barcode);
      const bUnit = esc(bTallyUnit);
      const bPrice = bDoc.price !== undefined && bDoc.price !== null ? bDoc.price : 0;
      totalPrice += bPrice;

      const resolvedItemGodown = await resolveTallyGodownName(bDoc.godown || requesterGodown || 'GOKUL SHIRGAON');
      const godown = esc(resolvedItemGodown);

      consumptionLines += `
      <INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${bName}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${bPrice}</RATE>
        <AMOUNT>${bPrice}</AMOUNT>
        <ACTUALQTY>1 ${bUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${bUnit}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${godown}</GODOWNNAME>
          <BATCHNAME>${bCode}</BATCHNAME>
          <DESTINATIONGODOWNNAME>${godown}</DESTINATIONGODOWNNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <RATE>${bPrice}</RATE>
          <AMOUNT>${bPrice}</AMOUNT>
          <ACTUALQTY>1 ${bUnit}</ACTUALQTY>
          <BILLEDQTY>1 ${bUnit}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESOUT.LIST>`;
    }

    const pPrice = materialInfo?.price !== undefined && materialInfo?.price !== null && materialInfo?.price > 0 ? materialInfo.price : totalPrice;
    const pAmount = pPrice;
    const resolvedParentDestGodown = await resolveTallyGodownName(parentBc.godown || requesterGodown || 'GOKUL SHIRGAON');
    const destGodown = esc(resolvedParentDestGodown);

    // Build production entry (Destination) for ONLY the single parent barcode
    const productionLines = `
    <INVENTORYENTRIESIN.LIST>
      <STOCKITEMNAME>${parentName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <RATE>${pPrice}</RATE>
      <AMOUNT>-${pAmount}</AMOUNT>
      <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <GODOWNNAME>${destGodown}</GODOWNNAME>
        <BATCHNAME>${parentBarcode}</BATCHNAME>
        <DESTINATIONGODOWNNAME>${destGodown}</DESTINATIONGODOWNNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${pPrice}</RATE>
        <AMOUNT>-${pAmount}</AMOUNT>
        <ACTUALQTY>1 ${pUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${pUnit}</BILLEDQTY>
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
            <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
              <NARRATION>Merged barcodes (${mergeBarcodeDocs.map(b => b.barcode).join(', ')}) into parent barcode ${parentBc.barcode} (mergeId: ${mergeId})</NARRATION>
              ${consumptionLines}
              ${productionLines}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    console.log(`Posting Tally Autofill Stock Journal for merge ${mergeId}: ${mergeBarcodeDocs.map(b => b.barcode).join(', ')} -> ${parentBc.barcode}`);
    const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    console.log(`Tally Autofill Stock Journal response for merge ${mergeId}:`, voucherRes.data);

    const parsedImport = await parser.parseStringPromise(voucherRes.data);
    const importResult = parsedImport?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
    if (importResult) {
      const lineError = importResult.LINEERROR;
      if (lineError) {
        const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
        throw new Error(errorText);
      }
      const errorsCount = parseTallyNumber(importResult.ERRORS);
      const exceptionsCount = parseTallyNumber(importResult.EXCEPTIONS);
      if (errorsCount > 0 || exceptionsCount > 0) {
        throw new Error(`Tally import failed with ${errorsCount} errors and ${exceptionsCount} exceptions.`);
      }
    }

    let lastCreatedVchId = '';
    const cmpInfoEx = parsedImport?.ENVELOPE?.BODY?.DESC?.CMPINFOEX;
    if (cmpInfoEx && cmpInfoEx.IDINFO && cmpInfoEx.IDINFO.LASTCREATEDVCHID) {
      lastCreatedVchId = typeof cmpInfoEx.IDINFO.LASTCREATEDVCHID === 'object'
        ? cmpInfoEx.IDINFO.LASTCREATEDVCHID._
        : cmpInfoEx.IDINFO.LASTCREATEDVCHID;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const queryXml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>VoucherNumbers</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
              <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="VoucherNumbers" ISINITIALIZE="Yes">
                  <TYPE>Voucher</TYPE>
                  <FILTER>IsMergeJournal</FILTER>
                  <FETCH>VoucherNumber, MasterId</FETCH>
                </COLLECTION>
                <SYSTEM TYPE="Formula" NAME="IsMergeJournal">$VoucherTypeName = "Autofill Stock Journal"</SYSTEM>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>`;

      const queryRes = await axios.post(liveTallyUrl, queryXml, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 3000
      });
      const queryParsed = await parser.parseStringPromise(queryRes.data);
      const rawVouchers = queryParsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
      if (rawVouchers) {
        const vList = Array.isArray(rawVouchers) ? rawVouchers : [rawVouchers];
        const latest = vList[vList.length - 1];
        if (latest) {
          const vNum = typeof latest.VOUCHERNUMBER === 'object' ? latest.VOUCHERNUMBER._ : latest.VOUCHERNUMBER;
          if (vNum) {
            console.log(`Resolved Tally VoucherNumber for merge ${mergeId}: ${vNum}`);
            return vNum;
          }
        }
      }
    } catch (queryErr) {
      console.error(`Failed to query voucher number from Tally for merge ${mergeId}:`, queryErr.message);
    }

    const fallbackVchNum = lastCreatedVchId ? `Tally-ID-${lastCreatedVchId}` : 'Tally-SUCCESS';
    console.log(`Fallback Tally voucher number assigned for merge: ${fallbackVchNum}`);
    return fallbackVchNum;
  } catch (err) {
    console.error(`Failed to post Merge Stock Journal to Tally:`, err.message);
    throw err;
  }
};

/**
 * Fetches current godown name, item name, and unit for a barcode directly from Tally Prime
 */
exports.getBarcodeTallyDetails = async (barcodeStr) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return null;

    // 1. Fetch active company
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
      timeout: 1000
    });

    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const parsedComp = await parser.parseStringPromise(compResponse.data);
    const activeCompanyObj = parsedComp?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
    let companyName = '';
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

    if (!companyName) return null;

    // 2. Query all stock items with BatchAllocations
    const xmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>StockItemsCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${companyName.trim()}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="StockItemsCollection" ISINITIALIZE="Yes">
                <TYPE>StockItem</TYPE>
                <FETCH>Name, BaseUnits, BatchAllocations.List</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const response = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 1500
    });

    const rawXml = typeof response.data === 'string' ? response.data : String(response.data);
    const sanitizedXml = rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    const parsedData = await parser.parseStringPromise(sanitizedXml);
    const rawItems = parsedData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || [];
    const stockItems = Array.isArray(rawItems) ? rawItems : [rawItems];

    for (const item of stockItems) {
      let itemName = '';
      if (item.$ && item.$.NAME) itemName = item.$.NAME;
      else if (item.NAME) itemName = typeof item.NAME === 'string' ? item.NAME : (item.NAME._ || '');
      itemName = itemName.trim();

      const rawAllocations = item['BATCHALLOCATIONS.LIST'] || item['batchallocations.list'];
      if (rawAllocations) {
        const allocations = Array.isArray(rawAllocations) ? rawAllocations : [rawAllocations];
        for (const alloc of allocations) {
          let batchName = '';
          if (alloc.BATCHNAME) {
            batchName = typeof alloc.BATCHNAME === 'object' ? alloc.BATCHNAME._ : alloc.BATCHNAME;
          } else if (alloc.batchname) {
            batchName = typeof alloc.batchname === 'object' ? alloc.batchname._ : alloc.batchname;
          }

          if (batchName && batchName.trim().toLowerCase() === barcodeStr.toLowerCase().trim()) {
            let godownName = '';
            if (alloc.GODOWNNAME) {
              godownName = typeof alloc.GODOWNNAME === 'object' ? alloc.GODOWNNAME._ : alloc.GODOWNNAME;
            } else if (alloc.godownname) {
              godownName = typeof alloc.godownname === 'object' ? alloc.godownname._ : alloc.godownname;
            }

            let unit = 'pcs';
            if (item.BASEUNITS) {
              unit = typeof item.BASEUNITS === 'object' ? (item.BASEUNITS._ || 'pcs') : item.BASEUNITS;
              if (unit === 'Not Applicable') unit = 'pcs';
            }

            return {
              itemName,
              godown: godownName || 'GOKUL SHIRGAON',
              unit: unit.trim()
            };
          }
        }
      }
    }
    // 3. Fallback: Search Day Book vouchers
    const voucherXmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>VouchersByBatchCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${companyName.trim()}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="VouchersByBatchCollection" ISINITIALIZE="Yes">
                <TYPE>Voucher</TYPE>
                <FETCH>VoucherNumber, Date, VoucherTypeName, InventoryEntries.List, InventoryEntriesIn.List, InventoryEntriesOut.List, AllInventoryEntries.List</FETCH>
                <FILTER>VchTypeFilter</FILTER>
              </COLLECTION>
              <SYSTEM NAME="VchTypeFilter" TYPE="Formula">$VoucherTypeName = "Autofill Stock Journal" or $VoucherTypeName = "Gokul Shirgaon Godown Transfer" or $VoucherTypeName = "Stock Journal" or $VoucherTypeName = "Purchase" or $VoucherTypeName = "Receipt Note"</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const vResponse = await axios.post(liveTallyUrl, voucherXmlPayload, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 1500
    });

    const rawVXml = typeof vResponse.data === 'string' ? vResponse.data : String(vResponse.data);
    const sanitizedVXml = rawVXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    const parsedVData = await parser.parseStringPromise(sanitizedVXml);
    const rawVouchers = parsedVData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER || [];
    const vouchers = Array.isArray(rawVouchers) ? rawVouchers : [rawVouchers];

    for (const v of vouchers) {
      const entries = [];
      const addEntry = (list) => {
        if (!list) return;
        const array = Array.isArray(list) ? list : [list];
        entries.push(...array);
      };
      addEntry(v['INVENTORYENTRIES.LIST'] || v['inventoryentries.list']);
      addEntry(v['INVENTORYENTRIESIN.LIST'] || v['inventoryentriesin.list']);
      addEntry(v['INVENTORYENTRIESOUT.LIST'] || v['inventoryentriesout.list']);
      addEntry(v['ALLINVENTORYENTRIES.LIST'] || v['allinventoryentries.list']);

      for (const entry of entries) {
        let entryMatName = '';
        const nameKey = Object.keys(entry).find(k => k.toLowerCase() === 'stockitemname');
        if (nameKey) {
          const val = entry[nameKey];
          entryMatName = typeof val === 'object' ? val._ : val;
        }

        const rawAllocations = entry['BATCHALLOCATIONS.LIST'] || entry['batchallocations.list'];
        if (rawAllocations) {
          const allocations = Array.isArray(rawAllocations) ? rawAllocations : [rawAllocations];
          for (const alloc of allocations) {
            let batchName = '';
            if (alloc.BATCHNAME) {
              batchName = typeof alloc.BATCHNAME === 'object' ? alloc.BATCHNAME._ : alloc.BATCHNAME;
            } else if (alloc.batchname) {
              batchName = typeof alloc.batchname === 'object' ? alloc.batchname._ : alloc.batchname;
            }
            if (batchName && batchName.trim().toLowerCase() === barcodeStr.toLowerCase().trim()) {
              let godownName = '';
              if (alloc.GODOWNNAME) {
                godownName = typeof alloc.GODOWNNAME === 'object' ? alloc.GODOWNNAME._ : alloc.GODOWNNAME;
              } else if (alloc.godownname) {
                godownName = typeof alloc.godownname === 'object' ? alloc.godownname._ : alloc.godownname;
              }
              return {
                itemName: entryMatName ? entryMatName.trim() : null,
                godown: godownName || 'GOKUL SHIRGAON',
                unit: 'Nos'
              };
            }
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.error('Error fetching barcode Tally details:', err.message);
    return null;
  }
};

/**
 * Create a Tally "Autofill Stock Journal" voucher for an exchange action.
 * Moves 1 unit of old barcode out of the employee's godown (source)
 * and produces:
 *   1) 1 unit of old barcode under the employee's godown (destination)
 *   2) 1 unit of new barcode under the employee's godown (destination)
 *
 * @param {string} exchangeId - Unique exchange request ID for narration tracking
 * @param {object} oldBc - Old barcode details { materialName, barcode }
 * @param {object} newBcDoc - New barcode details { materialName, barcode }
 * @param {object} parentMaterial - Parent material info { unit, price }
 * @param {string} employeeGodown - The employee name / godown name
 * @returns {string|undefined} - The Tally voucher number if successfully created
 */
exports.createTallyExchangeStockJournal = async (exchangeId, oldBc, newBcDoc, parentMaterial, employeeGodown, voucherDate) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';
    if (!liveTallyUrl) return;

    // 1. Fetch active company
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
    let companyName = '';
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

    if (!companyName) {
      console.warn(`No active Tally company found. Skipping Exchange Stock Journal for ${exchangeId}.`);
      return;
    }

    // 2. Format Date (YYYYMMDD) - Use actual transaction / voucher date
    const dateStr = formatTallyDate(voucherDate);

    // 3. Escape XML helper
    const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Resolve old item name using live Tally items list to prevent silent dropping in Tally Prime
    let oldTallyName = oldBc.materialName;
    let oldTallyUnit = oldBc.unit || parentMaterial?.unit || 'Nos';
    try {
      const resolved = await resolveTallyItemName(oldTallyName);
      if (resolved) {
        oldTallyName = resolved.name;
        oldTallyUnit = resolved.unit || oldTallyUnit;
        console.log(`Resolved live Tally stock item name for exchange old barcode ${oldBc.barcode}: ${oldTallyName} (${oldTallyUnit})`);
      }
    } catch (err) {
      console.warn(`Failed to resolve Tally item name for exchange old barcode ${oldBc.barcode}:`, err.message);
    }
    const oldName = esc(oldTallyName);
    const oldBarcode = esc(oldBc.barcode);

    // Resolve new item name using live Tally items list to prevent silent dropping in Tally Prime
    let newTallyName = newBcDoc.materialName || oldBc.materialName;
    let newTallyUnit = parentMaterial?.unit || 'Nos';
    try {
      const resolved = await resolveTallyItemName(newTallyName);
      if (resolved) {
        newTallyName = resolved.name;
        newTallyUnit = resolved.unit || newTallyUnit;
        console.log(`Resolved live Tally stock item name for exchange child barcode ${newBcDoc.barcode}: ${newTallyName} (${newTallyUnit})`);
      }
    } catch (err) {
      console.warn(`Failed to resolve Tally item name for exchange child barcode ${newBcDoc.barcode}:`, err.message);
    }
    const newName = esc(newTallyName);
    const newBarcode = esc(newBcDoc.barcode);

    // Old unit and price details
    const oUnit = esc(oldTallyUnit);
    const oPrice = oldBc.price !== undefined && oldBc.price !== null ? oldBc.price : (parentMaterial?.price || 0);
    const oAmount = oPrice;

    // New unit and price details
    const nUnit = esc(newTallyUnit);
    const nPrice = newBcDoc.price !== undefined && newBcDoc.price !== null ? newBcDoc.price : (parentMaterial?.price || 0);
    const nAmount = nPrice;

    const resolvedEmployeeGodown = await resolveTallyGodownName(employeeGodown || 'GOKUL SHIRGAON');
    const godown = esc(resolvedEmployeeGodown);

    // Consumption (Outward): old barcode consumed (1 unit)
    const consumptionLines = `
    <INVENTORYENTRIESOUT.LIST>
      <STOCKITEMNAME>${oldName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <RATE>${oPrice}</RATE>
      <AMOUNT>${oAmount}</AMOUNT>
      <ACTUALQTY>1 ${oUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${oUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${oldBarcode}</BATCHNAME>
        <GODOWNNAME>${godown}</GODOWNNAME>
        <RATE>${oPrice}</RATE>
        <AMOUNT>${oAmount}</AMOUNT>
        <ACTUALQTY>1 ${oUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${oUnit}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESOUT.LIST>`;

    // Production (Inward): old barcode (1 unit) + new barcode (1 unit) produced
    const productionLines = `
    <INVENTORYENTRIESIN.LIST>
      <STOCKITEMNAME>${oldName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <RATE>${oPrice}</RATE>
      <AMOUNT>-${oAmount}</AMOUNT>
      <ACTUALQTY>1 ${oUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${oUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${oldBarcode}</BATCHNAME>
        <GODOWNNAME>${godown}</GODOWNNAME>
        <RATE>${oPrice}</RATE>
        <AMOUNT>-${oAmount}</AMOUNT>
        <ACTUALQTY>1 ${oUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${oUnit}</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
    </INVENTORYENTRIESIN.LIST>
    <INVENTORYENTRIESIN.LIST>
      <STOCKITEMNAME>${newName}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <RATE>${nPrice}</RATE>
      <AMOUNT>-${nAmount}</AMOUNT>
      <ACTUALQTY>1 ${nUnit}</ACTUALQTY>
      <BILLEDQTY>1 ${nUnit}</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
        <BATCHNAME>${newBarcode}</BATCHNAME>
        <GODOWNNAME>${godown}</GODOWNNAME>
        <RATE>${nPrice}</RATE>
        <AMOUNT>-${nAmount}</AMOUNT>
        <ACTUALQTY>1 ${nUnit}</ACTUALQTY>
        <BILLEDQTY>1 ${nUnit}</BILLEDQTY>
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
            <VOUCHER VCHTYPE="Autofill Stock Journal" ACTION="Create">
              <DATE>${dateStr}</DATE>
              <VOUCHERTYPENAME>Autofill Stock Journal</VOUCHERTYPENAME>
              <NARRATION>Exchange barcode by ${employeeGodown} from old ${oldBc.barcode} to new ${newBcDoc.barcode} (exchangeId: ${exchangeId})</NARRATION>
              ${productionLines}
              ${consumptionLines}
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    console.log(`Posting Tally Autofill Stock Journal for exchange ${exchangeId}: ${oldBc.barcode} -> ${newBcDoc.barcode}`);
    const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    console.log(`Tally Autofill Stock Journal response for exchange ${exchangeId}:`, voucherRes.data);

    const parsedImport = await parser.parseStringPromise(voucherRes.data);
    const importResult = parsedImport?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
    if (importResult) {
      const lineError = importResult.LINEERROR;
      if (lineError) {
        const errorText = typeof lineError === 'string' ? lineError : (lineError?._ || JSON.stringify(lineError));
        throw new Error(errorText);
      }
      const errorsCount = parseTallyNumber(importResult.ERRORS);
      const exceptionsCount = parseTallyNumber(importResult.EXCEPTIONS);
      if (errorsCount > 0 || exceptionsCount > 0) {
        throw new Error(`Tally import failed with ${errorsCount} errors and ${exceptionsCount} exceptions.`);
      }
    }

    // Extract last created voucher ID if present from import metadata as a reliable fallback
    let lastCreatedVchId = '';
    const cmpInfoEx = parsedImport?.ENVELOPE?.BODY?.DESC?.CMPINFOEX;
    if (cmpInfoEx && cmpInfoEx.IDINFO && cmpInfoEx.IDINFO.LASTCREATEDVCHID) {
      lastCreatedVchId = typeof cmpInfoEx.IDINFO.LASTCREATEDVCHID === 'object'
        ? cmpInfoEx.IDINFO.LASTCREATEDVCHID._
        : cmpInfoEx.IDINFO.LASTCREATEDVCHID;
    }

    // Wait 500ms for Tally to persist, then query for the auto-generated Voucher Number
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
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
                <SYSTEM NAME="NarrationFilter" TYPE="Formula">$Narration contains "${exchangeId}"</SYSTEM>
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
          console.log(`Extracted Tally exchange voucher number for ${exchangeId}: ${vNum}`);
          return vNum;
        }
      }
    } catch (queryErr) {
      console.error(`Failed to query voucher number from Tally for exchange ${exchangeId}:`, queryErr.message);
    }

    // Fallback if import succeeded but the voucher number query timed out or failed
    const fallbackVchNum = lastCreatedVchId ? `Tally-ID-${lastCreatedVchId}` : 'Tally-SUCCESS';
    console.log(`Fallback Tally voucher number assigned: ${fallbackVchNum}`);
    return fallbackVchNum;
  } catch (err) {
    console.error(`Failed to post Exchange Stock Journal to Tally:`, err.message);
    throw err;
  }
};
