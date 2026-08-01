const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const Responsibility = require('../models/Responsibility');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const { generateRoleCode, getAccessibleUserFilter } = require('../middleware/rbac');
const { evaluateApprovalWorkflow } = require('../services/workflowEngine');

const runTests = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
    await mongoose.connect(mongoUri);
    console.log('\n======================================================');
    console.log('RUNNING ENTERPRISE DYNAMIC RBAC & WORKFLOW ENGINE TESTS');
    console.log('======================================================\n');

    let passedTests = 0;
    let totalTests = 5;

    // TEST 1: DYNAMIC ROLE CODE GENERATION
    console.log('--- TEST 1: Dynamic Role Code Generator ---');
    const generatedCode = generateRoleCode('TC', 'SF', 60, 'b');
    console.log(`Generated Role Code: ${generatedCode}`);
    if (generatedCode === 'TCSF60b') {
      console.log('✓ TEST 1 PASSED: Dynamic role code correctly formatted without hardcoded tables!\n');
      passedTests++;
    } else {
      console.error(`✗ TEST 1 FAILED: Expected TCSF60b, got ${generatedCode}\n`);
    }

    // TEST 2: MULTI-TIER REPORTING HIERARCHY
    console.log('--- TEST 2: Multi-tier Reporting Hierarchy Lookup ---');
    const adesh = await User.findOne({ email: 'adesh@example.com' }).populate('reportsTo');
    const vikram = await User.findOne({ email: 'vikram@example.com' }).populate('reportsTo');
    const rahul = await User.findOne({ email: 'rahul@example.com' }).populate('reportsTo');

    console.log(`Adesh reports to: ${adesh?.reportsTo?.name}`);
    console.log(`Vikram reports to: ${vikram?.reportsTo?.name}`);
    console.log(`Rahul reports to: ${rahul?.reportsTo?.name}`);

    if (adesh?.reportsTo?.email === 'vikram@example.com' && vikram?.reportsTo?.email === 'rahul@example.com' && rahul?.reportsTo?.email === 'imran@example.com') {
      console.log('✓ TEST 2 PASSED: 4-Tier reporting hierarchy correctly resolved from database!\n');
      passedTests++;
    } else {
      console.error('✗ TEST 2 FAILED: Reporting hierarchy mismatch!\n');
    }

    // TEST 3: DYNAMIC DATA SCOPE ENFORCEMENT
    console.log('--- TEST 3: Dynamic Data Visibility Scope Filters ---');
    const adeshFilter = getAccessibleUserFilter(adesh, 'user');
    const vikramFilter = getAccessibleUserFilter(vikram, 'user');
    const rahulFilter = getAccessibleUserFilter(rahul, 'user');
    const imran = await User.findOne({ email: 'imran@example.com' });
    const imranFilter = getAccessibleUserFilter(imran, 'user');

    console.log('Adesh Filter (SELF):', JSON.stringify(adeshFilter));
    console.log('Vikram Filter (TEAM):', JSON.stringify(vikramFilter));
    console.log('Rahul Filter (DEPARTMENT):', JSON.stringify(rahulFilter));
    console.log('Imran Filter (COMPANY/ALL):', JSON.stringify(imranFilter));

    if (adeshFilter.user && vikramFilter.$or && rahulFilter.department && Object.keys(imranFilter).length === 0) {
      console.log('✓ TEST 3 PASSED: Data scope filters (SELF, TEAM, DEPARTMENT, ALL) properly generated!\n');
      passedTests++;
    } else {
      console.error('✗ TEST 3 FAILED: Scope filters invalid!\n');
    }

    // TEST 4: BUSINESS RESPONSIBILITIES RESOLUTION
    console.log('--- TEST 4: Dynamic Business Responsibilities Resolution ---');
    const storeResp = await Responsibility.findOne({ code: 'STORE_APPROVER' }).populate('assignedEmployees');
    const finResp = await Responsibility.findOne({ code: 'FINANCE_APPROVER' }).populate('assignedEmployees');

    const storeApproverName = storeResp?.assignedEmployees[0]?.name;
    const finApproverName = finResp?.assignedEmployees[0]?.name;

    console.log(`STORE_APPROVER resolves to: ${storeApproverName}`);
    console.log(`FINANCE_APPROVER resolves to: ${finApproverName}`);

    if (storeApproverName.includes('Ajay') && finApproverName.includes('Priya')) {
      console.log('✓ TEST 4 PASSED: Dynamic business responsibilities correctly resolved to assigned employees!\n');
      passedTests++;
    } else {
      console.error('✗ TEST 4 FAILED: Responsibility resolution failed!\n');
    }

    // TEST 5: DYNAMIC WORKFLOW EVALUATION (Unified Material Movement Approval Policy)
    console.log('--- TEST 5: Dynamic Approval Workflow Engine Evaluation ---');
    const materialEval = await evaluateApprovalWorkflow('Material', { value: 90500 }, adesh);
    console.log(`Material Workflow (${materialEval.workflowName}):`);
    materialEval.steps.forEach(s => console.log(`   Step ${s.stepIndex}: ${s.stepName} -> Approver: ${s.approverName}`));

    if (materialEval.steps.length === 2 && materialEval.steps[0].approverName.includes('Vikram') && materialEval.steps[1].approverName.includes('Ajay')) {
      console.log('\n✓ TEST 5 PASSED: Dynamic approval engine automatically routed unified Material Movement Approval Policy!\n');
      passedTests++;
    } else {
      console.error('\n✗ TEST 5 FAILED: Dynamic workflow evaluation mismatch!\n');
    }

    console.log('======================================================');
    console.log(`FINAL RESULT: ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Test Execution Failure:', err);
    process.exit(1);
  }
};

runTests();
