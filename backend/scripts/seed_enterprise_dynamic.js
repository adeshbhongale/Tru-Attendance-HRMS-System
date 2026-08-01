const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const RoleTemplate = require('../models/RoleTemplate');
const Responsibility = require('../models/Responsibility');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const User = require('../models/User');

const seedEnterpriseData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for Enterprise Dynamic Seeding...');

    // 1. COMPANY
    await Company.deleteMany({});
    const company = await Company.create({
      name: 'TruCode Systems Ltd',
      code: 'TC',
      description: 'Enterprise ERP & Geo Attendance Solutions',
      branches: [
        { name: 'Pune Headquarters', code: 'PNE', city: 'Pune', isHeadquarters: true },
        { name: 'Kolhapur Branch', code: 'KOP', city: 'Kolhapur', isHeadquarters: false },
      ],
    });
    console.log('✓ Company Master seeded');

    // 2. LEVEL MASTER
    await Level.deleteMany({});
    const levelDefs = [
      { name: 'Founder', priority: 100, canApprove: true, canAssign: true, canViewAll: true, canManageTeam: true },
      { name: 'Board', priority: 95, canApprove: true, canAssign: true, canViewAll: true, canManageTeam: true },
      { name: 'CEO', priority: 90, canApprove: true, canAssign: true, canViewAll: true, canManageTeam: true },
      { name: 'VP', priority: 80, canApprove: true, canAssign: true, canViewAll: true, canManageTeam: true },
      { name: 'AVP', priority: 70, canApprove: true, canAssign: true, canViewAll: true, canManageTeam: true },
      { name: 'TL (Team Lead)', priority: 60, canApprove: true, canAssign: true, canViewAll: false, canManageTeam: true },
      { name: 'Senior Executive', priority: 50, canApprove: false, canAssign: false, canViewAll: false, canManageTeam: false },
      { name: 'Executive', priority: 40, canApprove: false, canAssign: false, canViewAll: false, canManageTeam: false },
      { name: 'Member', priority: 30, canApprove: false, canAssign: false, canViewAll: false, canManageTeam: false },
      { name: 'Trainee', priority: 20, canApprove: false, canAssign: false, canViewAll: false, canManageTeam: false },
      { name: 'Intern', priority: 10, canApprove: false, canAssign: false, canViewAll: false, canManageTeam: false },
    ];
    const seededLevels = await Level.insertMany(levelDefs);
    console.log(`✓ ${seededLevels.length} Level Masters seeded (Priority 100 to 10)`);

    // 3. GRADE MASTER
    await Grade.deleteMany({});
    const gradeDefs = [
      { name: 'Grade A', code: 'a', order: 1, salaryMultiplier: 1.0 },
      { name: 'Grade B', code: 'b', order: 2, salaryMultiplier: 1.25 },
      { name: 'Grade C', code: 'c', order: 3, salaryMultiplier: 1.6 },
      { name: 'Grade D', code: 'd', order: 4, salaryMultiplier: 2.1 },
    ];
    const seededGrades = await Grade.insertMany(gradeDefs);
    console.log(`✓ ${seededGrades.length} Grade Masters seeded`);

    // 4. DEPARTMENTS
    const deptDefs = [
      { name: 'Software', prefix: 'SF', description: 'Software Development & AI Services' },
      { name: 'Projects', prefix: 'PJ', description: 'Client Turnkey Projects' },
      { name: 'Finance & Accounts', prefix: 'FN', description: 'Finance, Payroll & Accounts' },
      { name: 'Store & Warehouse', prefix: 'ST', description: 'Store, Inventory & Dispatch' },
      { name: 'HR & Administration', prefix: 'HR', description: 'Human Resources & Recruitment' },
      { name: 'Sales & Business', prefix: 'SL', description: 'Sales, Marketing & CRM' },
    ];

    for (const d of deptDefs) {
      await Department.findOneAndUpdate({ prefix: d.prefix }, d, { upsert: true, new: true });
    }
    const depts = await Department.find();
    console.log(`✓ ${depts.length} Departments updated with prefix codes`);

    // 5. DESIGNATIONS
    const desigDefs = [
      { name: 'React Developer', shortName: 'RD', description: 'Frontend React Developer' },
      { name: 'AI Engineer', shortName: 'AIE', description: 'Machine Learning & AI Models' },
      { name: 'DevOps Engineer', shortName: 'DE', description: 'Infrastructure & CI/CD' },
      { name: 'Store Supervisor', shortName: 'SS', description: 'Godown Store Manager' },
      { name: 'Finance Manager', shortName: 'FM', description: 'Chief Accounts & Finance' },
    ];
    for (const des of desigDefs) {
      await Designation.findOneAndUpdate({ name: des.name }, des, { upsert: true, new: true });
    }
    console.log('✓ Designations seeded');

    // 6. BUSINESS RESPONSIBILITIES
    await Responsibility.deleteMany({});
    const respDefs = [
      { code: 'STORE_APPROVER', name: 'Store Dispatch Approver', module: 'Material', description: 'Authorized to process & dispatch material requests' },
      { code: 'FINANCE_APPROVER', name: 'Finance Sign-off Authority', module: 'Finance', description: 'Authorized to approve financial expenditure' },
      { code: 'PURCHASE_APPROVER', name: 'Purchase Approver', module: 'Purchase', description: 'Authorized to approve purchase orders' },
      { code: 'INVENTORY_CONTROLLER', name: 'Inventory Controller', module: 'Material', description: 'Authorized to conduct stock audits & returns' },
      { code: 'EXPENSE_AUDITOR', name: 'Expense Auditor', module: 'Expenses', description: 'Authorized to audit staff expense claims' },
      { code: 'LEAVE_APPROVER', name: 'HR Leave Approver', module: 'Leave', description: 'Authorized to approve multi-day leave requests' },
      { code: 'MANAGEMENT_APPROVER', name: 'Executive Sign-off', module: 'General', description: 'Authorized for top tier executive sign-offs' },
    ];
    const seededResps = await Responsibility.insertMany(respDefs);
    console.log(`✓ ${seededResps.length} Business Responsibilities seeded`);

    // Map helpers
    const lvlCEO = seededLevels.find(l => l.priority === 90);
    const lvlVP = seededLevels.find(l => l.priority === 80);
    const lvlTL = seededLevels.find(l => l.priority === 60);
    const lvlExec = seededLevels.find(l => l.priority === 40);

    const gradeA = seededGrades.find(g => g.code === 'a');
    const gradeB = seededGrades.find(g => g.code === 'b');
    const gradeC = seededGrades.find(g => g.code === 'c');

    const respStoreApp = seededResps.find(r => r.code === 'STORE_APPROVER');
    const respFinApp = seededResps.find(r => r.code === 'FINANCE_APPROVER');
    const respExpAud = seededResps.find(r => r.code === 'EXPENSE_AUDITOR');

    // Delete existing test users with these emails or mobile numbers
    const testEmails = ['imran@example.com', 'rahul@example.com', 'vikram@example.com', 'adesh@example.com', 'ajay@example.com', 'priya@example.com'];
    const testMobiles = ['9199990001', '9199990002', '9199990003', '9199990004', '9199990005', '9199990006'];
    await User.deleteMany({ $or: [{ email: { $in: testEmails } }, { mobile: { $in: testMobiles } }] });

    // CEO: Imran
    const ceoUser = await User.create({
      name: 'Imran (CEO)',
      mobile: '9199990001',
      email: 'imran@example.com',
      role: 'company_admin',
      roleCode: 'TCCA1',
      roleLevel: 1,
      levelRef: lvlCEO._id,
      gradeRef: gradeC._id,
      department: 'Management',
      designation: 'CEO & Founder',
      company: company._id,
      dataScope: 'COMPANY',
      responsibilityCodes: ['MANAGEMENT_APPROVER'],
    });

    // Software Dept Manager: Rahul
    const softHead = await User.create({
      name: 'Rahul (Software Head)',
      mobile: '9199990002',
      email: 'rahul@example.com',
      role: 'department_admin',
      roleCode: 'TCSF80C',
      roleLevel: 1,
      levelRef: lvlVP._id,
      gradeRef: gradeC._id,
      department: 'Software',
      designation: 'VP of Software',
      company: company._id,
      reportsTo: ceoUser._id,
      dataScope: 'DEPARTMENT',
    });

    // Software Team Lead: Vikram
    const softTL = await User.create({
      name: 'Vikram (Software TL)',
      mobile: '9199990003',
      email: 'vikram@example.com',
      role: 'team_lead',
      roleCode: 'TCSF60B',
      roleLevel: 2,
      levelRef: lvlTL._id,
      gradeRef: gradeB._id,
      department: 'Software',
      designation: 'Software Lead',
      company: company._id,
      reportsTo: softHead._id,
      dataScope: 'TEAM',
    });

    // React Developer: Adesh
    const devAdesh = await User.create({
      name: 'Adesh (React Developer)',
      mobile: '9199990004',
      email: 'adesh@example.com',
      role: 'employee',
      roleCode: 'TCSF40A',
      roleLevel: 4,
      levelRef: lvlExec._id,
      gradeRef: gradeA._id,
      department: 'Software',
      designation: 'React Developer',
      company: company._id,
      reportsTo: softTL._id,
      approver: softTL._id,
      dataScope: 'SELF',
    });

    // Store Head: Ajay
    const storeAjay = await User.create({
      name: 'Ajay (Store Supervisor)',
      mobile: '9199990005',
      email: 'ajay@example.com',
      role: 'department_admin',
      roleCode: 'TCST70C',
      roleLevel: 1,
      levelRef: lvlVP._id,
      gradeRef: gradeC._id,
      department: 'Store & Warehouse',
      designation: 'Store Supervisor',
      company: company._id,
      reportsTo: ceoUser._id,
      responsibilityCodes: ['STORE_APPROVER', 'INVENTORY_CONTROLLER'],
      dataScope: 'DEPARTMENT',
    });

    // Finance Head: Priya
    const finPriya = await User.create({
      name: 'Priya (Finance Manager)',
      mobile: '9199990006',
      email: 'priya@example.com',
      role: 'department_admin',
      roleCode: 'TCFN80C',
      roleLevel: 1,
      levelRef: lvlVP._id,
      gradeRef: gradeC._id,
      department: 'Finance & Accounts',
      designation: 'Finance Manager',
      company: company._id,
      reportsTo: ceoUser._id,
      responsibilityCodes: ['FINANCE_APPROVER', 'EXPENSE_AUDITOR'],
      dataScope: 'DEPARTMENT',
    });

    // Link assigned users back to Responsibilities
    await Responsibility.updateOne({ code: 'STORE_APPROVER' }, { assignedEmployees: [storeAjay._id] });
    await Responsibility.updateOne({ code: 'FINANCE_APPROVER' }, { assignedEmployees: [finPriya._id] });
    await Responsibility.updateOne({ code: 'EXPENSE_AUDITOR' }, { assignedEmployees: [finPriya._id] });

    console.log('✓ Multi-tier Reporting Hierarchy Employees seeded (Imran -> Rahul -> Vikram -> Adesh)');

    // 8. DYNAMIC APPROVAL WORKFLOWS (Unified Standard Policy without monetary price tiers)
    await ApprovalWorkflow.deleteMany({});

    // Unified Material Movement Approval Policy
    await ApprovalWorkflow.create({
      name: 'Material Movement Approval Policy',
      module: 'Material',
      company: company._id,
      priorityOrder: 1,
      conditions: [], // Standard policy applies to all material requests regardless of value
      steps: [
        { stepIndex: 1, stepName: 'Immediate Manager Approval', approverType: 'REPORTS_TO' },
        { stepIndex: 2, stepName: 'Store Dispatch Fulfillment', approverType: 'RESPONSIBILITY', targetResponsibility: 'STORE_APPROVER' },
      ],
    });

    // Workflow 4: Expense Claims
    await ApprovalWorkflow.create({
      name: 'Expense Report Standard Policy',
      module: 'Expense',
      company: company._id,
      priorityOrder: 1,
      conditions: [{ field: 'amount', operator: 'gt', value: 5000 }],
      steps: [
        { stepIndex: 1, stepName: 'Immediate Manager Approval', approverType: 'REPORTS_TO' },
        { stepIndex: 2, stepName: 'Finance Audit', approverType: 'RESPONSIBILITY', targetResponsibility: 'EXPENSE_AUDITOR' },
      ],
    });

    console.log('✓ Dynamic Conditional Approval Workflows seeded');
    console.log('\n======================================================');
    console.log('SUCCESS: Enterprise Dynamic Organization & RBAC Engine Seeded!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Seeding Error:', err);
    process.exit(1);
  }
};

seedEnterpriseData();
