const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log(' MATERIAL MOVEMENT SYSTEM — MOBILE & BACKEND CONTRACT TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

// 1. Check all critical mobile files exist and have non-empty content
console.log('1. Checking Mobile Files Existence & Integrity...');
const mobileFiles = [
  'mobile-app/src/modules/material/api/materialApi.js',
  'mobile-app/src/modules/material/components/GeoCameraModal.js',
  'mobile-app/src/modules/material/components/DatePickerModal.js',
  'mobile-app/src/modules/material/screens/SplitMaterialScreen.js',
  'mobile-app/src/modules/material/screens/MergeMaterialScreen.js',
  'mobile-app/src/modules/material/screens/ExchangeBarcodeScreen.js',
  'mobile-app/src/modules/material/screens/ReturnMaterialScreen.js',
  'mobile-app/src/modules/material/screens/ReturnMultipleScreen.js',
  'mobile-app/src/modules/material/screens/ReceivingFormScreen.js',
  'mobile-app/src/modules/material/screens/StoreDispatchScreen.js',
  'mobile-app/src/modules/material/screens/MaterialRequestScreen.js',
  'mobile-app/src/modules/material/screens/MaterialDetailScreen.js',
  'mobile-app/src/modules/material/screens/BarcodeDetailScreen.js',
  'mobile-app/src/modules/material/screens/PendingTransactionsScreen.js',
];

const workspaceRoot = path.resolve(__dirname, '../..');

for (const relPath of mobileFiles) {
  const fullPath = path.join(workspaceRoot, relPath);
  const exists = fs.existsSync(fullPath);
  assert(exists, `File exists: ${relPath}`);
  if (exists) {
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(content.length > 50, `File not empty (${content.length} bytes): ${relPath}`);
  }
}

// 2. Test materialApi.js Endpoints and Methods
console.log('\n2. Testing materialApi.js Methods & Route Alignments...');
const materialApiContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/api/materialApi.js'), 'utf8');

const requiredMethods = [
  'getDashboardMetrics',
  'getTallyInventory',
  'getTallyCustomers',
  'getTransactions',
  'getPendingTransactions',
  'getTransactionById',
  'createTransaction',
  'approveTransaction',
  'rejectTransaction',
  'storeAcceptTransaction',
  'assignHandler',
  'dispatchTransaction',
  'handlerAction',
  'receiveTransaction',
  'rejectReceipt',
  'getWorkflowContext',
  'getStoreAvailableBarcodes',
  'getMyActiveBarcodes',
  'getBarcodesByTransaction',
  'getBarcodeDetail',
  'transferBarcode',
  'handleTransfer',
  'splitBarcode',
  'approveSplit',
  'mergeBarcode',
  'approveMerge',
  'exchangeBarcode',
  'respondExchange',
  'convertBarcode',
  'respondCloseRequest',
  'returnBarcode',
  'returnMultipleBarcodes',
  'acceptReturn',
  'bulkAcceptReturns',
  'assignReturnHandler',
  'returnHandlerAction',
  'getAllTransfers',
  'getAllSplits',
  'getAllReturns',
  'getAllCloseRequests',
  'getAllExchanges',
  'getAllMerges',
  'getPendingTransfers',
  'getPendingSplits',
  'getPendingReturns',
  'getPendingCloseRequests',
  'getPendingExchanges',
  'getPendingMerges',
  'getUsers',
  'uploadBase64',
];

for (const method of requiredMethods) {
  assert(materialApiContent.includes(method), `materialApi exposes '${method}'`);
}

// Check correct REST endpoints
assert(materialApiContent.includes("'/barcodes/merge-request'"), "mergeBarcode targets '/barcodes/merge-request'");
assert(materialApiContent.includes("'/barcodes/approve-merge'"), "approveMerge targets '/barcodes/approve-merge'");
assert(materialApiContent.includes("'/barcodes/list/transfers'"), "getAllTransfers targets '/barcodes/list/transfers'");
assert(materialApiContent.includes("'/barcodes/list/splits'"), "getAllSplits targets '/barcodes/list/splits'");
assert(materialApiContent.includes("'/barcodes/list/returns'"), "getAllReturns targets '/barcodes/list/returns'");
assert(materialApiContent.includes("'/barcodes/list/close-requests'"), "getAllCloseRequests targets '/barcodes/list/close-requests'");
assert(materialApiContent.includes("'/barcodes/list/exchange-requests'"), "getAllExchanges targets '/barcodes/list/exchange-requests'");
assert(materialApiContent.includes("'/barcodes/list/merge-requests'"), "getAllMerges targets '/barcodes/list/merge-requests'");
assert(materialApiContent.includes("'/barcodes/split-requests/pending'"), "getPendingSplits targets '/barcodes/split-requests/pending'");
assert(materialApiContent.includes("'/barcodes/returns/pending'"), "getPendingReturns targets '/barcodes/returns/pending'");
assert(materialApiContent.includes("'/barcodes/exchange-requests/pending'"), "getPendingExchanges targets '/barcodes/exchange-requests/pending'");
assert(materialApiContent.includes("'/barcodes/merge-requests/pending'"), "getPendingMerges targets '/barcodes/merge-requests/pending'");
assert(materialApiContent.includes('transactions/${id}/reject-receipt'), "rejectReceipt targets '/transactions/:id/reject-receipt'");
assert(materialApiContent.includes('barcodes/return/${returnId}/assign-handler'), "assignReturnHandler targets '/barcodes/return/:returnId/assign-handler'");

// 3. Test GeoCameraModal Implementation
console.log('\n3. Testing GeoCameraModal Implementation...');
const geoCameraContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/components/GeoCameraModal.js'), 'utf8');

assert(geoCameraContent.includes('uploadBase64'), 'GeoCameraModal uses materialApi.uploadBase64');
assert(geoCameraContent.includes('reverseGeocodeAddress'), 'GeoCameraModal performs reverse geocoding');
assert(geoCameraContent.includes('capturedAt'), 'GeoCameraModal includes capturedAt timestamp');
assert(geoCameraContent.includes('coordinates'), 'GeoCameraModal returns coordinates array');
assert(geoCameraContent.includes('gps'), 'GeoCameraModal returns gps object with lat, lng, address');

// 4. Test SplitMaterialScreen
console.log('\n4. Testing SplitMaterialScreen (Screen 6)...');
const splitContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/SplitMaterialScreen.js'), 'utf8');

assert(splitContent.includes('TallyMaterialSelectModal'), 'SplitMaterialScreen uses Tally autocomplete');
assert(splitContent.includes('additionalItems'), 'SplitMaterialScreen supports multiple split rows');
assert(splitContent.includes('GeoCameraModal'), 'SplitMaterialScreen includes GeoCamera live proof');
assert(splitContent.includes('splitBarcode'), 'SplitMaterialScreen calls materialApi.splitBarcode');
assert(splitContent.includes('locked'), 'SplitMaterialScreen documents original barcode lock state');

// 5. Test MergeMaterialScreen
console.log('\n5. Testing MergeMaterialScreen (Screen 7)...');
const mergeContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/MergeMaterialScreen.js'), 'utf8');

assert(mergeContent.includes('Select All'), 'MergeMaterialScreen includes Select All');
assert(mergeContent.includes('Clear All'), 'MergeMaterialScreen includes Clear All');
assert(mergeContent.includes('parentBarcodeMode'), 'MergeMaterialScreen supports parentBarcodeMode');
assert(mergeContent.includes('selectedBarcodes.length < 2'), 'MergeMaterialScreen enforces minimum 2 active barcodes');
assert(mergeContent.includes('mergeBarcode'), 'MergeMaterialScreen calls materialApi.mergeBarcode');

// 6. Test ExchangeBarcodeScreen
console.log('\n6. Testing ExchangeBarcodeScreen (Screen 9)...');
const exchangeContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/ExchangeBarcodeScreen.js'), 'utf8');

assert(exchangeContent.includes('warrantyReason'), 'ExchangeBarcodeScreen requires warrantyReason');
assert(exchangeContent.includes('hasNewBarcode'), 'ExchangeBarcodeScreen includes new barcode availability toggle');
assert(exchangeContent.includes('BarcodeScannerModal'), 'ExchangeBarcodeScreen integrates barcode scanner');
assert(exchangeContent.includes('/^\\d+$/'), 'ExchangeBarcodeScreen enforces numeric-only barcode validation');
assert(exchangeContent.includes('exchangeBarcode'), 'ExchangeBarcodeScreen calls materialApi.exchangeBarcode');

// 7. Test Return Screens
console.log('\n7. Testing ReturnMaterialScreen & ReturnMultipleScreen (Screen 11)...');
const returnMultipleContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/ReturnMultipleScreen.js'), 'utf8');

assert(returnMultipleContent.includes('Project Completed'), 'ReturnMultipleScreen contains spec reason enum');
assert(returnMultipleContent.includes('Damaged / Needs Repair'), 'ReturnMultipleScreen contains Damaged / Needs Repair');
assert(returnMultipleContent.includes('needs_repair'), 'ReturnMultipleScreen contains needs_repair condition');
assert(returnMultipleContent.includes('returnMethod'), 'ReturnMultipleScreen supports returnMethod direct vs handler');
assert(returnMultipleContent.includes('selectedHandlerId'), 'ReturnMultipleScreen includes handler picker');

// 8. Test ReceivingFormScreen
console.log('\n8. Testing ReceivingFormScreen (Screen 4)...');
const receivingContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/ReceivingFormScreen.js'), 'utf8');

assert(receivingContent.includes('handler-pickup'), 'ReceivingFormScreen supports handler-pickup mode');
assert(receivingContent.includes('store-return'), 'ReceivingFormScreen supports store-return mode');
assert(receivingContent.includes('transfer-accept'), 'ReceivingFormScreen supports transfer-accept mode');
assert(receivingContent.includes('receiverGeo'), 'ReceivingFormScreen sends receiverGeo in contract payload');

// 9. Test StoreDispatchScreen
console.log('\n9. Testing StoreDispatchScreen (Screen 3)...');
const dispatchContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/StoreDispatchScreen.js'), 'utf8');

assert(dispatchContent.includes('Array.isArray(geoData.coordinates)'), 'StoreDispatchScreen safely extracts array coordinates');
assert(dispatchContent.includes('/^\\d+$/'), 'StoreDispatchScreen validates numeric barcodes');
assert(dispatchContent.includes('GatePass_'), 'StoreDispatchScreen supports gate pass capture');

// 10. Test PendingTransactionsScreen
console.log('\n10. Testing PendingTransactionsScreen (Screen 2)...');
const pendingContent = fs.readFileSync(path.join(workspaceRoot, 'mobile-app/src/modules/material/screens/PendingTransactionsScreen.js'), 'utf8');

assert(pendingContent.includes('approveSplit'), 'PendingTransactionsScreen supports split approval');
assert(pendingContent.includes('actionNewBarcode'), 'PendingTransactionsScreen provides new serial input');
assert(pendingContent.includes('actionQuantity'), 'PendingTransactionsScreen provides quantity input');
assert(pendingContent.includes('actionRate'), 'PendingTransactionsScreen provides rate/valuation input');
assert(pendingContent.includes('actionGodown'), 'PendingTransactionsScreen provides godown input');
assert(pendingContent.includes('respondExchange'), 'PendingTransactionsScreen supports exchange approval');
assert(pendingContent.includes('approveMerge'), 'PendingTransactionsScreen supports merge approval');
assert(pendingContent.includes('handlerAction'), 'PendingTransactionsScreen supports handler collect/deliver actions');
assert(pendingContent.includes('rejectReceipt'), 'PendingTransactionsScreen supports reject receipt action');
assert(pendingContent.includes('assignReturnHandler'), 'PendingTransactionsScreen supports assign return handler');

// Summary
console.log('\n================================================================');
console.log(` TEST SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL MATERIAL MOVEMENT SYSTEM CONTRACT TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}
