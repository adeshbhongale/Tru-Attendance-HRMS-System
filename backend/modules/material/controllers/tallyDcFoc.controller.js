const axios = require('axios');
const xml2js = require('xml2js');
const Barcode = require('../models/Barcode');
const tallyController = require('./tally.controller');

const cleanTallyXml = (xmlInput) => {
  if (typeof xmlInput !== 'string') {
    if (Buffer.isBuffer(xmlInput)) {
      xmlInput = xmlInput.toString('utf8');
    } else {
      xmlInput = String(xmlInput || '');
    }
  }
  let clean = xmlInput.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;');
  clean = clean.replace(/&nbsp;/gi, ' ');
  return clean;
};

exports.getTallyCustomers = async (req, res) => {
  try {
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

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

    let companyName = '';
    try {
      const compResponse = await axios.post(liveTallyUrl, COMP_QUERY, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 2000
      });

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
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
    } catch (err) {
      console.warn('Tally connection timed out or offline while fetching active company. Using mock company.');
    }

    if (!companyName) {
      const mockCustomers = ['Acme Corporation', 'Star Industries', 'Precision Tools Ltd', 'Global Tech Solutions', 'Nexus Enterprises'];
      return res.json({ success: true, customers: mockCustomers });
    }

    // 2. Fetch Ledgers
    const LEDGER_QUERY = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LedgersCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${companyName.trim()}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LedgersCollection" ISINITIALIZE="Yes">
                <TYPE>Ledger</TYPE>
                <FETCH>Name, Parent</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const ledgerResponse = await axios.post(liveTallyUrl, LEDGER_QUERY, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 3000
    });

    let customers = [];
    try {
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
      const parsedData = await parser.parseStringPromise(cleanTallyXml(ledgerResponse.data));

      const ledgersObj = parsedData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
      if (ledgersObj) {
        const ledgers = Array.isArray(ledgersObj) ? ledgersObj : [ledgersObj];
        for (const ledger of ledgers) {
          let name = '';
          let parent = '';
          if (ledger.NAME) {
            name = typeof ledger.NAME === 'object' ? ledger.NAME._ : ledger.NAME;
          } else if (ledger.$ && ledger.$.NAME) {
            name = ledger.$.NAME;
          }
          if (ledger.PARENT) {
            parent = typeof ledger.PARENT === 'object' ? ledger.PARENT._ : ledger.PARENT;
          }

          if (parent && (parent.toLowerCase().includes('debtor') || parent.toLowerCase().includes('customer') || parent.toLowerCase() === 'sundry debtors')) {
            if (name) customers.push(name);
          }
        }
      }
    } catch (parseErr) {
      console.warn('xml2js parsing warning in getTallyCustomers, using regex extraction fallback:', parseErr.message);
      const rawData = String(ledgerResponse.data || '');
      const ledgerMatches = [...rawData.matchAll(/<LEDGER\b[^>]*>([\s\S]*?)<\/LEDGER>/gi)];
      for (const m of ledgerMatches) {
        const block = m[1];
        const nameMatch = block.match(/<NAME[^>]*>([\s\S]*?)<\/NAME>/i) || block.match(/NAME="([^"]+)"/i);
        const parentMatch = block.match(/<PARENT[^>]*>([\s\S]*?)<\/PARENT>/i);
        const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const parent = parentMatch ? parentMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        if (parent && (parent.toLowerCase().includes('debtor') || parent.toLowerCase().includes('customer') || parent.toLowerCase() === 'sundry debtors')) {
          if (name) customers.push(name);
        }
      }
    }

    customers = [...new Set(customers.filter(Boolean))];

    if (customers.length === 0) {
      customers = ['Acme Corporation', 'Star Industries', 'Precision Tools Ltd', 'Global Tech Solutions', 'Nexus Enterprises'];
    }

    return res.json({ success: true, customers });
  } catch (error) {
    console.error('Error fetching Tally customers:', error);
    const mockCustomers = ['Acme Corporation', 'Star Industries', 'Precision Tools Ltd', 'Global Tech Solutions', 'Nexus Enterprises'];
    return res.json({ success: true, customers: mockCustomers });
  }
};

exports.postTallyDeliveryNote = async (barcodeStr, customerName, documentNumber) => {
  const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

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
    timeout: 2000
  });

  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, strict: false });
  const parsedComp = await parser.parseStringPromise(cleanTallyXml(compResponse.data));
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
    throw new Error('No active Tally company found. Please ensure Tally Prime is running and a company is open.');
  }

  // 2. Fetch customer master details from Tally Prime
  const CUSTOMER_QUERY = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>LedgerDetailCollection</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${companyName.trim()}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="LedgerDetailCollection" ISINITIALIZE="Yes">
              <TYPE>Ledger</TYPE>
              <FETCH>NAME, PARENT, ADDRESS, PARTYGSTIN, GSTREGISTRATIONTYPE, COUNTRYNAME, STATENAME, PINCODE, LEDGSTREGDETAILS.LIST</FETCH>
              <FILTER>LedgerFilter</FILTER>
            </COLLECTION>
            <SYSTEM NAME="LedgerFilter" TYPE="Formula">$Name = "${customerName.trim()}"</SYSTEM>
          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>`;

  let addressLines = [];
  let stateName = 'Goa';
  let gstin = '';
  let gstRegType = 'Consumer';

  try {
    const custResponse = await axios.post(liveTallyUrl, CUSTOMER_QUERY, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 3000
    });

    const parsedCust = await parser.parseStringPromise(cleanTallyXml(custResponse.data));
    const ledgerObj = parsedCust?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (ledgerObj) {
      if (ledgerObj['ADDRESS.LIST']) {
        const rawAddr = ledgerObj['ADDRESS.LIST'].ADDRESS;
        const addrs = Array.isArray(rawAddr) ? rawAddr : (rawAddr ? [rawAddr] : []);
        addressLines = addrs.map(a => typeof a === 'object' ? a._ : a).filter(Boolean);
      }
      const pincode = ledgerObj.PINCODE?._ || ledgerObj.PINCODE || '';
      if (pincode && !addressLines.some(line => line.includes(pincode))) {
        addressLines.push(pincode);
      }

      gstin = ledgerObj.PARTYGSTIN?._ || ledgerObj.PARTYGSTIN || '';
      gstRegType = ledgerObj.GSTREGISTRATIONTYPE?._ || ledgerObj.GSTREGISTRATIONTYPE || 'Consumer';

      if (ledgerObj['LEDGSTREGDETAILS.LIST']) {
        const regDetails = Array.isArray(ledgerObj['LEDGSTREGDETAILS.LIST'])
          ? ledgerObj['LEDGSTREGDETAILS.LIST'][0]
          : ledgerObj['LEDGSTREGDETAILS.LIST'];
        if (regDetails) {
          if (regDetails.STATE) {
            stateName = typeof regDetails.STATE === 'object' ? regDetails.STATE._ : regDetails.STATE;
          }
          if (!gstin && regDetails.GSTIN) {
            gstin = typeof regDetails.GSTIN === 'object' ? regDetails.GSTIN._ : regDetails.GSTIN;
          }
          if (gstRegType === 'Consumer' && regDetails.GSTREGISTRATIONTYPE) {
            gstRegType = typeof regDetails.GSTREGISTRATIONTYPE === 'object'
              ? regDetails.GSTREGISTRATIONTYPE._
              : regDetails.GSTREGISTRATIONTYPE;
          }
        }
      }
    }
  } catch (custErr) {
    console.warn(`Could not fetch details for customer ${customerName} from Tally:`, custErr.message);
  }

  // 3. Fetch barcode details from Tally or MongoDB
  const bc = await Barcode.findOne({ barcode: barcodeStr, companyId: req.tenant.companyId }).populate('owner');
  if (!bc) {
    throw new Error(`Barcode ${barcodeStr} not found in database.`);
  }

  let itemName = bc.materialName;
  let godownName = (bc.owner && bc.owner.fullName) ? bc.owner.fullName : 'GOKUL SHIRGAON';
  if (godownName && godownName.toLowerCase().includes('gokul')) {
    godownName = 'GOKUL SHIRGAON';
  }
  let unit = bc.unit || 'Nos';
  let price = bc.price || 1000;

  try {
    const tallyDetails = await tallyController.getBarcodeTallyDetails(barcodeStr);
    if (tallyDetails) {
      if (tallyDetails.itemName) itemName = tallyDetails.itemName;
      // Do NOT overwrite godownName if we resolved it to the employee's name from MongoDB
      if (tallyDetails.godown && !(bc.owner && bc.owner.fullName)) {
        godownName = tallyDetails.godown;
      }
      if (tallyDetails.unit) unit = tallyDetails.unit;
      if (tallyDetails.price !== undefined && tallyDetails.price !== null) price = tallyDetails.price;
    }
  } catch (err) {
    console.warn(`Could not fetch live Tally details for barcode ${barcodeStr}, using fallback database details.`);
  }

  // For testing/compatibility, default to March 1, 2026 or environment override
  const dateStr = process.env.TALLY_TEST_DATE || '20260301';

  const cgstRate = 9;
  const sgstRate = 9;
  const cgstAmount = Number((price * (cgstRate / 100)).toFixed(2));
  const sgstAmount = Number((price * (sgstRate / 100)).toFixed(2));
  const totalAmount = Number((price + cgstAmount + sgstAmount).toFixed(2));

  // Resolve CGST/SGST ledger names based on active company
  let cgstLedgerName = 'CGST';
  let sgstLedgerName = 'SGST';
  if (companyName.trim() === 'TCSL DEMO') {
    cgstLedgerName = 'CGST @ 9%';
    sgstLedgerName = 'SGST @ 9%';
  }

  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const escCustomer = esc(customerName);
  const escItemName = esc(itemName);
  const escGodown = esc(godownName);
  const escBarcode = esc(barcodeStr);
  const escUnit = esc(unit);
  const escDocNumber = esc(documentNumber);
  const escGstin = esc(gstin);
  const escGstRegType = esc(gstRegType);
  const escState = esc(stateName);

  const addressXmlLines = addressLines.length > 0
    ? addressLines.map(line => `<BASICBUYERADDRESS>${esc(line)}</BASICBUYERADDRESS>`).join('\n              ')
    : `<BASICBUYERADDRESS>${escCustomer}</BASICBUYERADDRESS>`;

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
          <VOUCHER VCHTYPE="Delivery Note" ACTION="Create">
            <DATE>${dateStr}</DATE>
            <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escDocNumber}</VOUCHERNUMBER>
            <PROVIDEGSTDETAILS>Yes</PROVIDEGSTDETAILS>
            <PARTYLEDGERNAME>${escCustomer}</PARTYLEDGERNAME>
            <PARTYNAME>${escCustomer}</PARTYNAME>
            <STATENAME>${escState}</STATENAME>
            <PLACEOFSUPPLY>${escState}</PLACEOFSUPPLY>
            <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>
            <GSTREGISTRATIONTYPE>${escGstRegType}</GSTREGISTRATIONTYPE>
            <PARTYGSTIN>${escGstin}</PARTYGSTIN>
            
            <!-- Despatch/Delivery Details -->
            <BASICSHIPPEDBY>Trucode Company</BASICSHIPPEDBY>
            <BASICSHIPDOCUMENTNO>${escDocNumber}</BASICSHIPDOCUMENTNO>
            <BASICSHIPDESTINATION>${escState}</BASICSHIPDESTINATION>
            <BASICCARRIERNAME>Trucode Transporter</BASICCARRIERNAME>
            <BASICBILLOFLADINGNO>TR-LR-${escDocNumber}</BASICBILLOFLADINGNO>
            <BASICBILLOFLADINGDATE>${dateStr}</BASICBILLOFLADINGDATE>
            <BASICSHIPVEHICLENO>MH-09-TR-1234</BASICSHIPVEHICLENO>
            
            <!-- Order Details -->
            <BASICORDERREF>ORD-${escBarcode}</BASICORDERREF>
            <BASICORDERDATE>${dateStr}</BASICORDERDATE>
            
            <!-- Buyer Details -->
            <BASICBUYERNAME>${escCustomer}</BASICBUYERNAME>
            <BASICBUYERADDRESS.LIST TYPE="String">
              ${addressXmlLines}
            </BASICBUYERADDRESS.LIST>
            <BASICBUYERSSALESTAXNO>${escGstin}</BASICBUYERSSALESTAXNO>
            <BASICBUYERSTATE>${escState}</BASICBUYERSTATE>

            <NARRATION>Delivery Note created for conversion of Barcode ${escBarcode} to DC FOC</NARRATION>

            <!-- Customer Ledger Entry (Debit) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${escCustomer}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${totalAmount}</AMOUNT>
            </LEDGERENTRIES.LIST>

            <!-- CGST Ledger Entry (Credit) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(cgstLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${cgstAmount}</AMOUNT>
            </LEDGERENTRIES.LIST>

            <!-- SGST Ledger Entry (Credit) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(sgstLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${sgstAmount}</AMOUNT>
            </LEDGERENTRIES.LIST>

            <!-- Inventory Entry (Outward / Credit) -->
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escItemName}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${price}/${escUnit}</RATE>
              <AMOUNT>${price}</AMOUNT>
              <ACTUALQTY>1 ${escUnit}</ACTUALQTY>
              <BILLEDQTY>1 ${escUnit}</BILLEDQTY>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${escGodown}</GODOWNNAME>
                <BATCHNAME>${escBarcode}</BATCHNAME>
                <AMOUNT>${price}</AMOUNT>
                <ACTUALQTY>1 ${escUnit}</ACTUALQTY>
                <BILLEDQTY>1 ${escUnit}</BILLEDQTY>
                <ORDERNO>1</ORDERNO>
                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              </BATCHALLOCATIONS.LIST>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>IGST LUT Sales 0.10%</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${price}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  console.log(`Posting Tally Delivery Note for barcode ${barcodeStr} to customer ${customerName}...`);
  console.log('Tally XML Payload:\n', xmlPayload);
  const voucherRes = await axios.post(liveTallyUrl, xmlPayload, {
    headers: { 'Content-Type': 'text/xml' }
  });

  const parsedVoucher = await parser.parseStringPromise(cleanTallyXml(voucherRes.data));
  const result = parsedVoucher?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;

  if (!result) {
    throw new Error('Unexpected Tally Prime response structure.');
  }

  const created = Number(result.CREATED || 0);
  const errors = Number(result.ERRORS || 0);
  const exceptions = Number(result.EXCEPTIONS || 0);
  if (created === 0 || errors > 0 || exceptions > 0) {
    const errorMsg = result.LINEERROR || 'Tally Prime returned error/exceptions while posting Delivery Note.';
    throw new Error(errorMsg);
  }

  const lastCreatedId = parsedVoucher?.ENVELOPE?.BODY?.DESC?.CMPINFOEX?.IDINFO?.LASTCREATEDVCHID;
  return lastCreatedId || true;
};
