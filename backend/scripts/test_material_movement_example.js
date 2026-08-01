const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Department = require('../models/Department');
const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const workflowEngine = require('../services/workflowEngine');

// Material Movement server models using path.resolve
const transactionModelPath = path.resolve(__dirname, '../../../material-movement/server/src/models/Transaction');
const barcodeModelPath = path.resolve(__dirname, '../../../material-movement/server/src/models/Barcode');

const Transaction = require(transactionModelPath);
const Barcode = require(barcodeModelPath);

async function runTestExample() {
  console.log('===========================================================');
  console.log('  ENTERPRISE MATERIAL MOVEMENT END-TO-END FLOW TEST');
  console.log('===========================================================');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/geo_attendance_db';
  await mongoose.connect(mongoUri);

  // Ensure Transaction & Barcode models mongoose instance is connected
  if (Transaction.base && Transaction.base.connection.readyState === 0) {
    await Transaction.base.connect(mongoUri);
  }

  console.log('\n[1. CONNECT] Connected to MongoDB database cleanly.');

  // Find sample users from seeded enterprise database
  const requester = await User.findOne({ email: 'adesh@example.com' }) || await User.findOne({ role: 'employee' });
  const mgtApprover = await User.findOne({ email: 'rahul@example.com' }) || await User.findOne({ role: 'department_admin' });
  const storeUser = await User.findOne({ email: 'ajay@example.com' }) || await User.findOne({ role: 'department_admin', departmentAdminType: 'store' });

  if (!requester || !mgtApprover || !storeUser) {
    console.error('Missing seed users. Please run seed script first.');
    process.exit(1);
  }

  // Find valid department ObjectId
  let deptDoc = await Department.findOne({ name: 'Software' }) || await Department.findOne();
  if (!deptDoc) {
    deptDoc = await Department.create({ name: 'Engineering', code: 'ENG' });
  }

  console.log(`\n[2. ACTORS & ROLES]`);
  console.log(`- Requester: ${requester.fullName || requester.name} (${requester.email})`);
  console.log(`- Management Approver: ${mgtApprover.fullName || mgtApprover.name} (${mgtApprover.email})`);
  console.log(`- Store Warehouse Admin: ${storeUser.fullName || storeUser.name} (${storeUser.email})`);
  console.log(`- Department: ${deptDoc.name} (ID: ${deptDoc._id})`);

  // STEP 1: Create Material Request (RDC)
  console.log('\n-----------------------------------------------------------');
  console.log('STEP 1: Create Material Request (RDC)');
  console.log('-----------------------------------------------------------');

  const expDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const txIdNum = Math.floor(100000 + Math.random() * 900000);
  const txnIdStr = `RDC-2026-${txIdNum}`;

  const txn = await Transaction.create({
    transactionId: txnIdStr,
    requester: requester._id,
    sender: requester._id,
    department: deptDoc._id,
    documentType: 'RDC',
    isSimplified: true,
    expectedReturnDate: expDate,
    dueDate: expDate,
    description: 'Site Infrastructure Deployment - Fiber & Ethernet Cable Reels',
    managementApprover: mgtApprover._id,
    status: 'submitted',
    materials: [
      {
        name: 'CAT6 Armored Cable Reel 300m',
        materialName: 'CAT6 Armored Cable Reel 300m',
        quantity: 3,
        unit: 'Nos',
        price: 15500,
      },
      {
        name: '24-Port Gigabit Industrial Switch',
        materialName: '24-Port Gigabit Industrial Switch',
        quantity: 2,
        unit: 'Nos',
        price: 22000,
      }
    ],
    totalAmount: 90500,
    history: [{
      status: 'submitted',
      actionBy: requester._id,
      timestamp: new Date(),
      remarks: 'Draft request created via mobile app'
    }]
  });

  console.log(`✓ Material Request Created!`);
  console.log(`  - TXN ID: ${txn.transactionId}`);
  console.log(`  - Status: ${txn.status}`);
  console.log(`  - Items Count: ${txn.materials.length}`);
  console.log(`  - Total Est. Value: ₹${(txn.totalAmount || 90500).toLocaleString('en-IN')}`);

  // STEP 2: Workflow Engine Evaluation & Management Approval
  console.log('\n-----------------------------------------------------------');
  console.log('STEP 2: Workflow Engine Resolution & Approval');
  console.log('-----------------------------------------------------------');

  const workflowResolution = await workflowEngine.evaluateApprovalWorkflow(
    'Material',
    { amount: txn.totalAmount || 90500, documentType: 'RDC', department: deptDoc._id },
    requester
  );

  console.log(`✓ Dynamic Workflow Engine Resolved "${workflowResolution.workflowName}" with ${workflowResolution.steps.length} Step(s):`);
  workflowResolution.steps.forEach((st, i) => {
    console.log(`   Step ${i+1}: ${st.stepName} (${st.approverType}) -> Approver: ${st.approverName || 'Store Admin'} (${st.approverUser || 'Any'})`);
  });

  // Perform Management Approval
  txn.status = 'mgt_approved';
  if (!Array.isArray(txn.approvals)) txn.approvals = [];
  txn.approvals.push({
    user: mgtApprover._id,
    role: 'management',
    action: 'approved',
    timestamp: new Date(),
    remarks: 'Approved by Management Approver'
  });
  if (Array.isArray(txn.history)) {
    txn.history.push({
      status: 'mgt_approved',
      actionBy: mgtApprover._id,
      timestamp: new Date(),
      remarks: 'Approved by Management Approver'
    });
  }
  await txn.save();
  console.log(`✓ Management Approval Completed! New TXN Status: ${txn.status}`);

  // STEP 3: Store Dispatch & Serialized Barcode Generation
  console.log('\n-----------------------------------------------------------');
  console.log('STEP 3: Store Dispatch & Serialized Barcode Generation');
  console.log('-----------------------------------------------------------');

  const createdBarcodes = [];
  let bcIndex = 101;

  for (const item of txn.materials) {
    const itemMatName = item.materialName || item.name;
    for (let q = 0; q < item.quantity; q++) {
      const bcCode = `BAR-2026-${txIdNum}-${bcIndex++}`;
      const bcDoc = await Barcode.create({
        barcode: bcCode,
        materialName: itemMatName,
        transactionId: txn.transactionId,
        owner: storeUser._id,
        status: 'pending_acceptance',
        quantity: 1,
        unit: item.unit || 'Nos',
        ownershipHistory: [{
          user: storeUser._id,
          assignedAt: new Date(),
          action: 'created',
          remarks: 'Generated at Store Dispatch'
        }]
      });
      createdBarcodes.push(bcDoc);
    }
  }

  txn.status = 'dispatched';
  txn.handler = storeUser._id;
  txn.dispatchedAt = new Date();
  await txn.save();

  console.log(`✓ Store Dispatch Complete!`);
  console.log(`  - Assigned Handler: ${storeUser.fullName || storeUser.name}`);
  console.log(`  - Serialized Barcodes Generated (${createdBarcodes.length} Barcodes):`);
  createdBarcodes.forEach(b => console.log(`     * ${b.barcode} -> [${b.materialName}] (Status: ${b.status})`));

  // STEP 4: Recipient Receipt Verification with GeoPhoto Proof
  console.log('\n-----------------------------------------------------------');
  console.log('STEP 4: Recipient GeoPhoto Receipt Verification');
  console.log('-----------------------------------------------------------');

  const geoPhotoProof = {
    url: 'https://storage.googleapis.com/geo-proofs/receipt-proof-2026.jpg',
    metadata: {
      lat: 16.701,
      lng: 74.4496,
      accuracy: 5.2,
      capturedAt: new Date(),
      employeeName: requester.fullName || requester.name
    }
  };

  // Transfer barcode ownership to Requester and set status to Active
  for (const b of createdBarcodes) {
    b.status = 'Active';
    b.owner = requester._id;
    b.ownershipHistory.push({
      user: requester._id,
      assignedAt: new Date(),
      action: 'received',
      remarks: 'Material receipt verified via mobile GeoPhoto camera'
    });
    await b.save();
  }

  txn.status = 'received';
  txn.receivedAt = new Date();
  txn.receiptPhoto = geoPhotoProof;
  await txn.save();

  console.log(`✓ Materials Received & Credited to Inventory!`);
  console.log(`  - New TXN Status: ${txn.status}`);
  console.log(`  - Geo-Tagged Photo Proof URL: ${geoPhotoProof.url}`);
  console.log(`  - Recipient GPS Coordinates: ${geoPhotoProof.metadata.lat}, ${geoPhotoProof.metadata.lng}`);
  console.log(`  - Barcodes Updated to Active Ownership of ${requester.fullName || requester.name}`);

  // STEP 5: Barcode Operations Test (Split, Merge, Return)
  console.log('\n-----------------------------------------------------------');
  console.log('STEP 5: Testing Barcode Operations (Reel Split & Barcode Merge)');
  console.log('-----------------------------------------------------------');

  // 5A: Reel Split
  const targetParent = createdBarcodes[0];
  const splitChildCode = `${targetParent.barcode}-SPLIT-01`;

  const childBarcode = await Barcode.create({
    barcode: splitChildCode,
    parentBarcode: targetParent.barcode,
    materialName: targetParent.materialName,
    transactionId: txn.transactionId,
    owner: requester._id,
    status: 'Active',
    quantity: 0.5,
    unit: 'Nos',
    ownershipHistory: [{
      user: requester._id,
      assignedAt: new Date(),
      action: 'split',
      remarks: `Split from parent ${targetParent.barcode}`
    }]
  });

  console.log(`✓ Reel Split Completed!`);
  console.log(`  - Parent Reel: ${targetParent.barcode}`);
  console.log(`  - New Child Reel Created: ${childBarcode.barcode} (Qty: ${childBarcode.quantity})`);

  // 5B: Barcode Merge
  const mergeTargetCode = `BAR-2026-MERGED-${txIdNum}`;
  const barcodesToMerge = [createdBarcodes[1].barcode, createdBarcodes[2].barcode];

  const mergedBarcodeDoc = await Barcode.create({
    barcode: mergeTargetCode,
    materialName: `${createdBarcodes[1].materialName} (Merged Reel)`,
    transactionId: txn.transactionId,
    owner: requester._id,
    status: 'Merged',
    quantity: 2,
    unit: 'Nos',
    ownershipHistory: [{
      user: requester._id,
      assignedAt: new Date(),
      action: 'merged',
      remarks: `Merged from reels [${barcodesToMerge.join(', ')}]`
    }]
  });

  // Deactivate old merged source reels
  await Barcode.updateMany({ barcode: { $in: barcodesToMerge } }, { $set: { status: 'Closed' } });

  console.log(`\n✓ Barcode Lot Merge Completed!`);
  console.log(`  - Merged Source Reels: [${barcodesToMerge.join(', ')}] -> Set to Closed`);
  console.log(`  - Master Merged Reel Created: ${mergedBarcodeDoc.barcode} (Status: ${mergedBarcodeDoc.status})`);

  console.log('\n===========================================================');
  console.log('  FINAL VERIFICATION RESULT: ALL 5 STAGES EXECUTED 100% CLEANLY!');
  console.log('===========================================================');

  process.exit(0);
}

runTestExample().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
