const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Shift = require('../models/Shift');
const LeaveType = require('../models/LeaveType');
const Location = require('../models/Location');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Holiday = require('../models/Holiday');
const Customer = require('../models/Customer');
const CustomerVisit = require('../models/CustomerVisit');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Material = require('../models/Material');
const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const Company = require('../models/Company');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const RoleTemplate = require('../models/RoleTemplate');
const Responsibility = require('../models/Responsibility');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const ParentChildRule = require('../models/ParentChildRule');
const Transaction = require('../modules/material/models/Transaction');
const Barcode = require('../modules/material/models/Barcode');
const ExpenseClaim = require('../modules/hr/expense/models/ExpenseClaim');
const { ensureExpenseMasters } = require('../modules/hr/expense/services/seedExpenseMasters');
const {
  getActivePolicy,
  getExpenseTypes,
  resolveCityClass,
  getEntitlements,
  getEmployeeLevelNumber,
  getEmployeeGradeCode,
} = require('../modules/hr/expense/services/policyEngine');
const { calculateItem, round2 } = require('../modules/hr/expense/services/calculationEngine');
const workflowEngine = require('../services/workflowEngine');
const statsService = require('../services/attendanceStatsService');
const geoService = require('../services/geoTrackingService');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createDateFromIST } = require('../utils/timezone');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedData = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('CRITICAL ERROR: MONGO_URI is not defined in your .env file.');
      process.exit(1);
    }

    // A robust helper to run database operations with auto-retry and auto-reconnection
    const safeDbCall = async (fn, label = 'DB operation') => {
      let retries = 5;
      let delay = 2000;
      for (let i = 0; i < retries; i++) {
        try {
          if (mongoose.connection.readyState !== 1) {
            console.log(`[Connection] MongoDB not connected (readyState: ${mongoose.connection.readyState}). Reconnecting...`);
            try {
              await mongoose.disconnect();
            } catch (_) { }
            await new Promise(r => setTimeout(r, 1000));
            await mongoose.connect(process.env.MONGO_URI, {
              serverSelectionTimeoutMS: 30000,
              socketTimeoutMS: 60000,
              connectTimeoutMS: 30000,
            });
            console.log('[Connection] Reconnected successfully!');
          }
          return await fn();
        } catch (err) {
          const isNetworkError =
            err.message.includes('ECONNRESET') ||
            err.message.includes('socket') ||
            err.name === 'MongooseServerSelectionError' ||
            err.message.includes('buffered') ||
            err.message.includes('connection') ||
            err.message.includes('topology') ||
            err.code === 'ECONNRESET' ||
            err.code === 'EPIPE';

          if (isNetworkError && i < retries - 1) {
            console.warn(`[Retry] ${label} failed (Error: ${err.message}). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
            try {
              await mongoose.disconnect();
            } catch (_) { }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 1.5;
          } else {
            throw err;
          }
        }
      }
    };

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
    });
    console.log('Connection Successful!');

    const { clearCloudinaryStorage } = require('../config/cloudinary');

    const saveInBatches = async (Model, records, batchSize = 100) => {
      for (let i = 0; i < records.length; i += batchSize) {
        const chunk = records.slice(i, i + batchSize);
        let retries = 3;
        while (retries > 0) {
          try {
            await safeDbCall(() => Model.insertMany(chunk), `Batch insert for ${Model.modelName}`);
            break;
          } catch (err) {
            retries--;
            console.warn(`Batch insert failed for ${Model.modelName}. Retrying... (${3 - retries}/3). Error: ${err.message}`);
            if (retries === 0) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    };

    // 1. Clear existing data sequentially to avoid connection congestion
    console.log('Clearing existing database collections...');
    await safeDbCall(() => User.deleteMany({}), 'Clear Users');
    try {
      await User.collection.dropIndexes();
    } catch (_) { }
    await safeDbCall(() => Attendance.deleteMany(), 'Clear Attendance');
    await safeDbCall(() => Leave.deleteMany(), 'Clear Leave');
    await safeDbCall(() => Shift.deleteMany(), 'Clear Shift');
    await safeDbCall(() => LeaveType.deleteMany(), 'Clear LeaveType');
    await safeDbCall(() => Location.deleteMany(), 'Clear Location');
    await safeDbCall(() => Department.deleteMany(), 'Clear Department');
    await safeDbCall(() => Designation.deleteMany(), 'Clear Designation');
    await safeDbCall(() => Holiday.deleteMany(), 'Clear Holiday');
    await safeDbCall(() => Customer.deleteMany(), 'Clear Customer');
    await safeDbCall(() => CustomerVisit.deleteMany(), 'Clear CustomerVisit');
    await safeDbCall(() => Vendor.deleteMany(), 'Clear Vendor');
    await safeDbCall(() => Product.deleteMany(), 'Clear Product');
    try {
      await Product.collection.dropIndexes();
    } catch (_) { }
    await safeDbCall(() => Material.deleteMany(), 'Clear Material');
    await safeDbCall(() => Company.deleteMany({}), 'Clear Company');
    await safeDbCall(() => Level.deleteMany({}), 'Clear Level');
    try {
      await Level.collection.dropIndexes();
    } catch (_) { }
    await safeDbCall(() => Grade.deleteMany({}), 'Clear Grade');
    try {
      await Grade.collection.dropIndexes();
    } catch (_) { }
    await safeDbCall(() => ParentChildRule.deleteMany({}), 'Clear ParentChildRule');
    await safeDbCall(() => Responsibility.deleteMany({}), 'Clear Responsibility');
    await safeDbCall(() => ApprovalWorkflow.deleteMany({}), 'Clear ApprovalWorkflow');
    await safeDbCall(() => Transaction.deleteMany({}), 'Clear Transaction');
    await safeDbCall(() => Barcode.deleteMany({}), 'Clear Barcode');
    await safeDbCall(() => ExpenseClaim.deleteMany({}), 'Clear ExpenseClaim');
    // Clear old manual notifications, logs, feeds
    await safeDbCall(() => Promise.all([
      Notification.deleteMany({}),
      NotificationLog.deleteMany({}),
      EmployeeNotification.deleteMany({})
    ]), 'Clear Notifications');

    try {
      console.log('Clearing Cloudinary storage...');
      await clearCloudinaryStorage();
    } catch (cErr) {
      console.warn('Cloudinary clearing failed, skipping:', cErr.message);
    }
    console.log('Cleared existing collections and Cloudinary storage.');

    // 2. Create Primary Company TCSL First
    const company = await safeDbCall(() => Company.create({
      code: 'TCSL',
      companyCode: 'TCSL',
      name: 'TruCode Coding Systems Limited',
      companyName: 'TruCode Coding Systems Limited',
      legalName: 'TruCode Coding Systems Ltd.',
      email: 'info@trucode.in',
      phone: '+91 98765 43210',
      address: 'Tech Park, Suite 400, Mumbai, India',
      status: 'active',
      branches: [
        { name: 'Pune Headquarters', code: 'PNE', city: 'Pune', isHeadquarters: true },
        { name: 'Kolhapur Branch', code: 'KOP', city: 'Kolhapur', isHeadquarters: false },
      ],
    }), 'Create Company');
    const companyId = company._id;
    console.log('✓ Primary Company Master TCSL seeded:', companyId);

    // 3. Create Shifts
    const shifts = await safeDbCall(() => Shift.insertMany([
      {
        companyId,
        company: companyId,
        name: 'Morning Shift',
        startTime: '08:00',
        endTime: '16:00',
        gracePeriod: 15,
        halfDayAfter: '10:00',
        workingHours: 8,
        weeklyOff: ['Sunday'],
        lateRules: "If you are late then your payment will be deducted by 10% of the day's salary.",
        halfDayRules: "If you leave for half day then your payment will be deducted by 50% of the day's salary.",
        status: 'active'
      },
      {
        companyId,
        company: companyId,
        name: 'Evening Shift',
        startTime: '16:00',
        endTime: '00:00',
        gracePeriod: 15,
        halfDayAfter: '18:00',
        workingHours: 8,
        weeklyOff: ['Sunday'],
        lateRules: "If you are late then your payment will be deducted by 10% of the day's salary.",
        halfDayRules: "If you leave for half day then your payment will be deducted by 50% of the day's salary.",
        status: 'active'
      },
      {
        companyId,
        company: companyId,
        name: 'Night Shift',
        startTime: '00:00',
        endTime: '08:00',
        gracePeriod: 15,
        halfDayAfter: '02:00',
        workingHours: 8,
        weeklyOff: ['Sunday'],
        lateRules: "If you are late then your payment will be deducted by 10% of the day's salary.",
        halfDayRules: "If you leave for half day then your payment will be deducted by 50% of the day's salary.",
        status: 'active'
      }
    ]), 'Insert Shifts');
    console.log(`Created ${shifts.length} Shifts.`);

    // 3.1 Create Office Location
    const office = await safeDbCall(() => Location.create({
      companyId,
      company: companyId,
      name: 'Office Main HQ',
      latitude: 16.683282,
      longitude: 74.247635,
      radius: 100,
      address: 'Malhar Heights, Pratibha Nagar, Kolhapur, Maharashtra, India'
    }), 'Create Location');
    console.log('Created Office Location.');

    // 3.5 Create Leave Types
    const leaveTypesData = await safeDbCall(() => LeaveType.insertMany([
      { companyId, company: companyId, name: 'Casual Leave', code: 'CL', limit: 2, genderRestriction: 'All', status: 'active', limitType: 'Monthly' },
      { companyId, company: companyId, name: 'Sick Leave', code: 'SL', limit: 6, genderRestriction: 'All', status: 'active' },
      { companyId, company: companyId, name: 'Paid Leave', code: 'PL', limit: 6, genderRestriction: 'All', status: 'active' },
      { companyId, company: companyId, name: 'Unpaid Leave', code: 'LWP', limit: 12, genderRestriction: 'All', status: 'active' }
    ]), 'Insert Leave Types');
    console.log(`Created ${leaveTypesData.length} Leave Types.`);

    // 3.6 Create Departments matching Corporate Matrix
    const departmentsData = await safeDbCall(() => Department.insertMany([
      { companyId, company: companyId, name: 'Accounts and Purchase', prefix: 'AP', description: 'Accounts, Billing & Procurement' },
      { companyId, company: companyId, name: 'Stores and Dispatch', prefix: 'ST', description: 'Store & Godown Inventory Management' },
      { companyId, company: companyId, name: 'Projects and Engineering', prefix: 'PE', description: 'Projects & Engineering Operations' },
      { companyId, company: companyId, name: 'Electronics', prefix: 'EL', description: 'Electronics, Hardware & Embedded Systems' },
      { companyId, company: companyId, name: 'Software and Systems', prefix: 'SF', description: 'Software Development & Systems Architecture' },
      { companyId, company: companyId, name: 'Production and QC', prefix: 'PQ', description: 'Production & Quality Control' },
      { companyId, company: companyId, name: 'Sales and Marketing', prefix: 'SM', description: 'Sales, Marketing & Business Development' },
      { companyId, company: companyId, name: 'Customer Support', prefix: 'CS', description: 'Customer Service & Technical Support' },
      { companyId, company: companyId, name: 'HR and Admin', prefix: 'HR', description: 'Human Resources & Administration' },
      { companyId, company: companyId, name: 'Management', prefix: 'MN', description: 'Executive Management & Corporate Governance' },
    ]), 'Insert Departments');
    console.log(`Created ${departmentsData.length} Departments.`);

    // 3.65 Create Holidays
    const holidaysData = await safeDbCall(() => Holiday.insertMany([
      { companyId, company: companyId, holiday_date: new Date('2026-01-01'), holiday_name: 'New Year Day', holiday_type: 'd', status: 'active' },
      { companyId, company: companyId, holiday_date: new Date('2026-05-01'), holiday_name: 'Labour Day', holiday_type: 'd', status: 'active' },
      { companyId, company: companyId, holiday_date: new Date('2026-05-27'), holiday_name: 'Bakrid', holiday_type: 'd', status: 'active' },
      { companyId, company: companyId, holiday_date: new Date('2026-08-15'), holiday_name: 'Independence Day', holiday_type: 'd', status: 'active' },
      { companyId, company: companyId, holiday_date: new Date('2026-10-02'), holiday_name: 'Gandhi Jayanti', holiday_type: 'd', status: 'active' },
      { companyId, company: companyId, holiday_date: new Date('2026-12-25'), holiday_name: 'Christmas', holiday_type: 'd', status: 'active' }
    ]), 'Insert Holidays');
    console.log(`Created ${holidaysData.length} Holidays.`);

    // 3.7 Create Designations matching all departments & corporate levels
    const designationsData = await safeDbCall(() => Designation.insertMany([
      { companyId, company: companyId, name: 'Managing Director (MD)', description: 'Corporate Leadership' },
      { companyId, company: companyId, name: 'Chief Executive Officer (CEO)', description: 'Corporate Leadership' },
      { companyId, company: companyId, name: 'Vice President (VP)', description: 'Executive Management' },
      { companyId, company: companyId, name: 'General Manager (GM)', description: 'General Management' },
      { companyId, company: companyId, name: 'Department Manager / HOD', description: 'Departmental Leadership' },
      { companyId, company: companyId, name: 'Team Lead (TL)', description: 'Team Leadership' },
      { companyId, company: companyId, name: 'Software Engineer', description: 'Software Development' },
      { companyId, company: companyId, name: 'Senior Software Engineer', description: 'Software Development' },
      { companyId, company: companyId, name: 'Software Trainee', description: 'Software Development' },
      { companyId, company: companyId, name: 'Software Developer', description: 'Software Development' },
      { companyId, company: companyId, name: 'Systems Engineer', description: 'Systems & Infrastructure' },
      { companyId, company: companyId, name: 'Electronics Hardware Engineer', description: 'Electronics & Embedded Systems' },
      { companyId, company: companyId, name: 'Embedded Developer', description: 'Electronics & Firmware' },
      { companyId, company: companyId, name: 'Projects Engineer', description: 'Projects & Engineering' },
      { companyId, company: companyId, name: 'Dispatch Executive', description: 'Stores & Dispatch Operations' },
      { companyId, company: companyId, name: 'Junior Dispatch Executive', description: 'Stores & Dispatch Operations' },
      { companyId, company: companyId, name: 'Senior Store Executive', description: 'Stores & Dispatch Operations' },
      { companyId, company: companyId, name: 'Stores Team Member', description: 'Inventory & Storekeeping' },
      { companyId, company: companyId, name: 'Quality Control Operator', description: 'Quality Control & Production' },
      { companyId, company: companyId, name: 'Production Supervisor', description: 'Production & Manufacturing' },
      { companyId, company: companyId, name: 'Accounts Officer', description: 'Accounts & Finance' },
      { companyId, company: companyId, name: 'Junior Accounts Executive', description: 'Accounts & Finance' },
      { companyId, company: companyId, name: 'Purchase Executive', description: 'Procurement & Purchase' },
      { companyId, company: companyId, name: 'Sales Executive', description: 'Sales & Business Development' },
      { companyId, company: companyId, name: 'Marketing Specialist', description: 'Marketing & Brand Strategy' },
      { companyId, company: companyId, name: 'Customer Support Analyst', description: 'Customer Service & Technical Support' },
      { companyId, company: companyId, name: 'HR Executive', description: 'Human Resources' },
      { companyId, company: companyId, name: 'Admin Officer', description: 'Office Administration' }
    ]), 'Insert Designations');
    console.log(`Created ${designationsData.length} Designations.`);

    const levelDefs = [
      { companyId, company: companyId, name: 'BOD', levelNumber: 1, category: 'DIRECTOR', categoryPrefix: 'DI', usesDepartmentPrefix: false, defaultDataScope: 'ALL', canApprove: true, canAssign: true, canViewAll: true, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'CEO', levelNumber: 2, category: 'DIRECTOR', categoryPrefix: 'DI', usesDepartmentPrefix: false, defaultDataScope: 'ALL', canApprove: true, canAssign: true, canViewAll: true, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'VP', levelNumber: 3, category: 'MANAGEMENT', categoryPrefix: 'MN', usesDepartmentPrefix: false, defaultDataScope: 'COMPANY', canApprove: true, canAssign: true, canViewAll: true, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'AVP', levelNumber: 4, category: 'MANAGEMENT', categoryPrefix: 'MN', usesDepartmentPrefix: false, defaultDataScope: 'COMPANY', canApprove: true, canAssign: true, canViewAll: true, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'Manager', levelNumber: 5, category: 'LEADERSHIP', categoryPrefix: 'LD', usesDepartmentPrefix: false, defaultDataScope: 'DEPARTMENT', canApprove: true, canAssign: true, canViewAll: false, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'Group Leader', levelNumber: 6, category: 'LEADERSHIP', categoryPrefix: 'LD', usesDepartmentPrefix: false, defaultDataScope: 'DEPARTMENT', canApprove: true, canAssign: true, canViewAll: false, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'Team Leader', levelNumber: 7, category: 'LEADERSHIP', categoryPrefix: 'LD', usesDepartmentPrefix: false, defaultDataScope: 'TEAM', canApprove: true, canAssign: true, canViewAll: false, canViewDown: true, canManageTeam: true },
      { companyId, company: companyId, name: 'Senior Executive', levelNumber: 8, category: 'STAFF', categoryPrefix: null, usesDepartmentPrefix: true, defaultDataScope: 'SELF', canApprove: false, canAssign: false, canViewAll: false, canViewDown: false, canManageTeam: false },
      { companyId, company: companyId, name: 'Junior Executive', levelNumber: 9, category: 'STAFF', categoryPrefix: null, usesDepartmentPrefix: true, defaultDataScope: 'SELF', canApprove: false, canAssign: false, canViewAll: false, canViewDown: false, canManageTeam: false },
      { companyId, company: companyId, name: 'Team Member', levelNumber: 10, category: 'STAFF', categoryPrefix: null, usesDepartmentPrefix: true, defaultDataScope: 'SELF', canApprove: false, canAssign: false, canViewAll: false, canViewDown: false, canManageTeam: false },
      { companyId, company: companyId, name: 'Trainee', levelNumber: 11, category: 'TRAINEE', categoryPrefix: null, usesDepartmentPrefix: true, defaultDataScope: 'SELF', canApprove: false, canAssign: false, canViewAll: false, canViewDown: false, canManageTeam: false },
      { companyId, company: companyId, name: 'Intern', levelNumber: 12, category: 'TRAINEE', categoryPrefix: null, usesDepartmentPrefix: true, defaultDataScope: 'SELF', canApprove: false, canAssign: false, canViewAll: false, canViewDown: false, canManageTeam: false },
    ];
    const seededLevels = await safeDbCall(() => Level.insertMany(levelDefs), 'Insert Levels');
    console.log(`✓ ${seededLevels.length} Level Masters seeded.`);

    // Build map by Level Name
    const levelNameMap = {};
    seededLevels.forEach(l => { levelNameMap[l.name] = l._id; });

    // Seed default Parent-Child Hierarchy Rules
    const pcrDefs = [
      { companyId, company: companyId, parentLevel: levelNameMap['BOD'], allowedChildLevels: [levelNameMap['CEO'], levelNameMap['VP']] },
      { companyId, company: companyId, parentLevel: levelNameMap['CEO'], allowedChildLevels: [levelNameMap['VP'], levelNameMap['AVP']] },
      { companyId, company: companyId, parentLevel: levelNameMap['VP'], allowedChildLevels: [levelNameMap['AVP'], levelNameMap['Manager']] },
      { companyId, company: companyId, parentLevel: levelNameMap['AVP'], allowedChildLevels: [levelNameMap['Manager'], levelNameMap['Group Leader']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Manager'], allowedChildLevels: [levelNameMap['Group Leader'], levelNameMap['Team Leader']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Group Leader'], allowedChildLevels: [levelNameMap['Team Leader'], levelNameMap['Senior Executive']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Team Leader'], allowedChildLevels: [levelNameMap['Senior Executive'], levelNameMap['Junior Executive'], levelNameMap['Team Member']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Senior Executive'], allowedChildLevels: [levelNameMap['Junior Executive'], levelNameMap['Team Member']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Junior Executive'], allowedChildLevels: [levelNameMap['Team Member'], levelNameMap['Trainee']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Team Member'], allowedChildLevels: [levelNameMap['Trainee']] },
      { companyId, company: companyId, parentLevel: levelNameMap['Trainee'], allowedChildLevels: [levelNameMap['Intern']] },
    ];
    const seededPCRules = await safeDbCall(() => ParentChildRule.insertMany(pcrDefs), 'Insert ParentChildRules');
    console.log(`✓ ${seededPCRules.length} Parent-Child Hierarchy Rules seeded.`);

    const gradeDefs = [
      { companyId, company: companyId, name: 'Grade A', code: 'a', gradeOrder: 1, gradeLabel: 'A' },
      { companyId, company: companyId, name: 'Grade B', code: 'b', gradeOrder: 2, gradeLabel: 'B' },
      { companyId, company: companyId, name: 'Grade C', code: 'c', gradeOrder: 3, gradeLabel: 'C' },
    ];
    const seededGrades = await safeDbCall(() => Grade.insertMany(gradeDefs), 'Insert Grades');
    console.log(`✓ ${seededGrades.length} Grade Masters seeded.`);

    const respDefs = [
      { companyId, company: companyId, code: 'STORE_APPROVER', name: 'Store Dispatch Approver', module: 'Material', description: 'Authorized to process & dispatch material requests' },
      { companyId, company: companyId, code: 'FINANCE_APPROVER', name: 'Finance Sign-off Authority', module: 'Finance', description: 'Authorized to approve financial expenditure' },
      { companyId, company: companyId, code: 'PURCHASE_APPROVER', name: 'Purchase Approver', module: 'Purchase', description: 'Authorized to approve purchase orders' },
      { companyId, company: companyId, code: 'INVENTORY_CONTROLLER', name: 'Inventory Controller', module: 'Material', description: 'Authorized to conduct stock audits & returns' },
      { companyId, company: companyId, code: 'EXPENSE_AUDITOR', name: 'Expense Auditor', module: 'Expenses', description: 'Authorized to audit staff expense claims' },
      { companyId, company: companyId, code: 'LEAVE_APPROVER', name: 'HR Leave Approver', module: 'Leave', description: 'Authorized to approve multi-day leave requests' },
      { companyId, company: companyId, code: 'MANAGEMENT_APPROVER', name: 'Executive Sign-off', module: 'General', description: 'Authorized for top tier executive sign-offs' },
      { companyId, company: companyId, code: 'SITE_INCHARGE', name: 'Site Operations Incharge', module: 'Material', description: 'Authorized to oversee site material deployment & returns' },
      { companyId, company: companyId, code: 'HANDLER', name: 'Material Dispatch Handler', module: 'Material', description: 'Authorized material handler for transport and dispatch' },
    ];
    const seededResps = await safeDbCall(() => Responsibility.insertMany(respDefs), 'Insert Responsibilities');
    console.log(`✓ ${seededResps.length} Business Responsibilities seeded.`);

    // Seed Approval Workflow Policies (Expense, Material, Leave)
    const workflowPolicies = [
      {
        name: 'Expense Report Standard Policy',
        module: 'Expense',
        company: company._id,
        companyId: company._id,
        status: 'active',
        priorityOrder: 1,
        conditions: [{ field: 'amount', operator: 'gt', value: 5000 }],
        steps: [
          {
            stepIndex: 1,
            stepName: 'HR Admin Verification & Approval',
            stepType: 'APPROVAL',
            approverRule: 'HR_ADMIN',
            approverType: 'HR_ADMIN',
          },
          {
            stepIndex: 2,
            stepName: 'Account Admin Audit & Payment',
            stepType: 'APPROVAL',
            approverRule: 'ACCOUNT_ADMIN',
            approverType: 'ACCOUNT_ADMIN',
          },
        ],
      },
      {
        name: 'Material Movement Approval Policy',
        module: 'Material',
        company: company._id,
        companyId: company._id,
        status: 'active',
        priorityOrder: 2,
        conditions: [],
        steps: [
          {
            stepIndex: 1,
            stepName: 'Team Lead Approval',
            stepType: 'APPROVAL',
            approverRule: 'ROLE',
            targetLevelNumber: 7,
            targetRole: 'Level 7: Team Lead (TL)',
          },
          {
            stepIndex: 2,
            stepName: 'Management Approval',
            stepType: 'APPROVAL',
            approverRule: 'MANAGEMENT_CATEGORY',
            targetCategory: 'MANAGEMENT',
          },
          {
            stepIndex: 3,
            stepName: 'Store Dispatch',
            stepType: 'STORE',
            approverRule: 'STORE_ADMIN',
            approverType: 'STORE_ADMIN',
            dispatchMethod: 'DIRECT',
            featureFlags: { assignHandler: false, directDispatch: true },
          },
          {
            stepIndex: 4,
            stepName: 'Requester Acceptance',
            stepType: 'RECEIVE',
            approverRule: 'REQUESTER',
            approverType: 'REQUESTER',
          },
          {
            stepIndex: 5,
            stepName: 'Transfer',
            stepType: 'TRANSFER',
            approverRule: 'ANY_EMPLOYEE',
          },
          {
            stepIndex: 6,
            stepName: 'Return to Store',
            stepType: 'RETURN',
            approverRule: 'STORE_ADMIN',
          },
        ],
      },
      {
        name: 'Leave Request Standard Policy',
        module: 'Leave',
        company: company._id,
        companyId: company._id,
        status: 'active',
        priorityOrder: 3,
        conditions: [{ field: 'days', operator: 'gt', value: 3 }],
        steps: [
          {
            stepIndex: 1,
            stepName: 'Immediate Manager Approval',
            stepType: 'APPROVAL',
            approverRule: 'IMMEDIATE_MANAGER',
            approverType: 'IMMEDIATE_MANAGER',
          },
        ],
      },
    ];

    await safeDbCall(() => ApprovalWorkflow.insertMany(workflowPolicies), 'Insert ApprovalWorkflow Policies');
    console.log(`✓ ${workflowPolicies.length} Approval Workflow Policies seeded.`);

    // 4. Create Employees matching Department Master & Role Access Matrix
    const deptNames = ['Store', 'HR', 'Operations', 'Software', 'Finance', 'Sales'];
    const desigNames = ['Store Manager', 'HR Manager', 'Project Lead', 'Software Lead', 'Accounts Manager', 'Sales Lead'];
    const genders = ['Male', 'Female'];
    const bloodGroups = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB+'];
    const sampleAddresses = [
      'Flat 402, Royal Palms Apartments, M.G. Road, Pune, Maharashtra 411001',
      'Plot 12, Sunrise Enclave, Park Street, Bengaluru, Karnataka 560001',
      'House 88, Green Park Colony, Jubilee Hills, Hyderabad, Telangana 500033',
      'Flat 105, Sea View Residency, Bandra West, Mumbai, Maharashtra 400050',
      'Plot 45, Industrial Layout, Chakan MIDC, Pune, Maharashtra 410501',
      'Flat 301, Heritage Heights, Arundelpet, Guntur, Andhra Pradesh 522002',
      'House 24, Cyber City Colony, Gachibowli, Hyderabad, Telangana 500032'
    ];
    const sampleRefNames = ['Ramesh Patil', 'Suresh Sharma', 'Anand Verma', 'Vijay Kulkarni', 'Prakash Deshmukh', 'Nitin Shinde', 'Mahesh Joshi'];
    const sampleRefNumbers = ['9822011223', '9876543210', '9988776655', '9845011998', '9922055667', '9820066778', '9960123456'];

    const levelDocMap = {};
    seededLevels.forEach(l => {
      levelDocMap[l.name] = l;
      levelDocMap[l.name.toLowerCase()] = l;
    });

    const gradeDocMap = {};
    seededGrades.forEach(g => { gradeDocMap[g.code] = g; });

    const hashedPassword = await bcrypt.hash('password123', 10);

    // Structured Corporate Hierarchy Seed (Top-Down Matrix Chain)
    const structuredEmployees = [

      // Level 2: BOD
      {
        name: 'Pradnya Pise',
        email: 'pradnya.bod@example.com',
        mobile: '9100000001',
        role: 'employee',
        levelName: 'BOD',
        gradeCode: 'a',
        roleCode: 'TCDI1A',
        department: 'Management',
        designation: 'Board of Directors',
        reportsToName: null,
      },
      // Level 2: CEO
      {
        name: 'Minal Patil',
        email: 'minal.ceo@example.com',
        mobile: '9100000002',
        role: 'employee',
        levelName: 'CEO',
        gradeCode: 'a',
        roleCode: 'TCDI2A',
        department: 'Management',
        designation: 'CEO',
        reportsToName: 'Pradnya Pise',
      },

      // Level 3: VPs (Vice Presidents)
      {
        name: 'Preetam Dige',
        email: 'Preetam.vp@example.com',
        mobile: '9100000003',
        role: 'admin',
        levelName: 'VP',
        gradeCode: 'a',
        roleCode: 'TCMN3A',
        department: 'Accounts and Purchase',
        designation: 'VP Accounts & Stores',
        reportsToName: 'Minal Patil',
      },
      {
        name: 'Aditya Pise',
        email: 'aditya.vp@example.com',
        mobile: '9100000004',
        role: 'admin',
        levelName: 'VP',
        gradeCode: 'a',
        roleCode: 'TCMN3A',
        department: 'Software and Systems',
        designation: 'VP Software & Electronics',
        reportsToName: 'Minal Patil',
      },
      {
        name: 'Nirmal Punwani',
        email: 'nirmal.vp@example.com',
        mobile: '9100000005',
        role: 'admin',
        levelName: 'VP',
        gradeCode: 'a',
        roleCode: 'TCMN3A',
        department: 'Sales and Marketing',
        designation: 'VP Sales & Marketing',
        reportsToName: 'Minal Patil',
      },
      {
        name: 'Vikas Kansara',
        email: 'vikas.vp@example.com',
        mobile: '9100000006',
        role: 'admin',
        levelName: 'VP',
        gradeCode: 'a',
        roleCode: 'TCMN3A',
        department: 'Customer Support',
        designation: 'VP Customer Support',
        reportsToName: 'Minal Patil',
      },

      // Level 4: AVP (Assistant Vice President)
      {
        name: 'Indrajeet Rane',
        email: 'indrajeet.avp@example.com',
        mobile: '9100000007',
        role: 'admin',
        levelName: 'AVP',
        gradeCode: 'a',
        roleCode: 'TCMN4A',
        department: 'Sales and Marketing',
        designation: 'AVP Sales & Marketing',
        reportsToName: 'Nirmal Punwani',
      },

      // Level 7: Team Leaders / Department Leads
      {
        name: 'Ayush Patil',
        email: 'ayush.tl@example.com',
        mobile: '9100000008',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCST7A',
        department: 'Stores and Dispatch',
        designation: 'Stores & Dispatch Team Lead',
        reportsToName: 'Preetam Dige',
      },
      {
        name: 'Imran Shaikh',
        email: 'imran.tl@example.com',
        mobile: '9100000009',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCPE7A',
        department: 'Projects and Engineering',
        designation: 'Projects & Engineering Team Lead',
        reportsToName: 'Aditya Pise',
      },
      {
        name: 'Rajshree Patil',
        email: 'rajshree.tl@example.com',
        mobile: '9100000010',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCHR7A',
        department: 'HR and Admin',
        designation: 'HR & Admin Team Lead',
        reportsToName: 'Minal Patil',
      },
      {
        name: 'Abhay Mudgal',
        email: 'abhay.tl@example.com',
        mobile: '9100000031',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCCS7A',
        department: 'Customer Support',
        designation: 'Customer Support Team Lead',
        reportsToName: 'Vikas Kansara',
      },
      {
        name: 'Sanket Kharade',
        email: 'sanket.el@example.com',
        mobile: '9100000016',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCEL7A',
        department: 'Electronics',
        designation: 'Electronics Team Lead',
        reportsToName: 'Aditya Pise',
      },
      {
        name: 'Prathmesh Joshi',
        email: 'prathmesh.tl@example.com',
        mobile: '9100000032',
        role: 'team_lead',
        levelName: 'Team Leader',
        gradeCode: 'a',
        roleCode: 'TCSF7A',
        department: 'Software and Systems',
        designation: 'Software Engineering Team Lead',
        reportsToName: 'Aditya Pise',
      },

      // Level 8: Senior Executives
      // Store Admin Gokul Shirgaon (Connected to Tally Prime Store Godown - Level 9 below Ayush Patil)
      {
        name: 'Gokul Shirgaon',
        email: 'gokul.shirgaon@example.com',
        mobile: '9876500701',
        role: 'employee',
        adminType: 'store',
        levelName: 'Senior Executive',
        gradeCode: 'a',
        roleCode: 'TCST8A',
        department: 'Stores and Dispatch',
        designation: 'Senior Store Executive',
        reportsToName: "Ayush Patil",
      },
      {
        name: 'Suryakant Kore',
        email: 'suryakant.sr@example.com',
        mobile: '9100000015',
        role: 'employee',
        levelName: 'Senior Executive',
        gradeCode: 'a',
        roleCode: 'TCPE8A',
        department: 'Projects and Engineering',
        designation: 'Senior Projects Engineer',
        reportsToName: 'Imran Shaikh',
      },
      {
        name: 'Akshay Kusale',
        email: 'akshayk.cs@example.com',
        mobile: '9100000017',
        role: 'employee',
        levelName: 'Senior Executive',
        gradeCode: 'b',
        roleCode: 'TCCS8A',
        department: 'Customer Support',
        designation: 'Senior Customer Support Executive',
        reportsToName: 'Abhay Mudgal',
      },
      {
        name: 'Suraj Mane',
        email: 'surajm.cs@example.com',
        mobile: '9100004028',
        role: 'employee',
        levelName: 'Senior Executive',
        gradeCode: 'a',
        roleCode: 'TCCS8A',
        department: 'Customer Support',
        designation: 'Senior Customer Support Executive',
        reportsToName: 'Abhay Mudgal',
      },

      // Level 9: Junior Executives
      {
        name: 'Apurva Otari',
        email: 'apurva.sr@example.com',
        mobile: '9100000011',
        role: 'employee',
        levelName: 'Junior Executive',
        gradeCode: 'a',
        roleCode: 'TCAP9A',
        department: 'Accounts and Purchase',
        designation: 'Junior Accounts Executive',
        reportsToName: 'Preetam Dige',
      },
      {
        name: 'Sanket Karande',
        email: 'sanket.pe@example.com',
        mobile: '9100000021',
        role: 'employee',
        levelName: 'Junior Executive',
        gradeCode: 'b',
        roleCode: 'TCPE9B',
        department: 'Projects and Engineering',
        designation: 'Junior Site Engineer',
        reportsToName: 'Imran Shaikh',
      },
      {
        name: 'Rahul Koparde',
        email: 'rahulk.jr@example.com',
        mobile: '9100000013',
        role: 'employee',
        levelName: 'Junior Executive',
        gradeCode: 'b',
        roleCode: 'TCST9B',
        department: 'Stores and Dispatch',
        designation: 'Junior Dispatch Executive',
        reportsToName: 'Ayush Patil',
      },
      {
        name: 'Mrunal Kudalkar',
        email: 'mrunal.sf@example.com',
        mobile: '9100000023',
        role: 'employee',
        levelName: 'Junior Executive',
        gradeCode: 'a',
        roleCode: 'TCSF9A',
        department: 'Software and Systems',
        designation: 'Junior Software Engineer',
        reportsToName: 'Prathmesh Joshi',
      },

      // Level 10: Team Members
      {
        name: 'Amruta Patil',
        email: 'amruta.jr@example.com',
        mobile: '9100000020',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'b',
        roleCode: 'TCAP9B',
        department: 'Accounts and Purchase',
        designation: 'Junior Accounts Officer',
        reportsToName: 'Preetam Dige',
      },
      {
        name: 'Gaurav Musale',
        email: 'gaurav.tm@example.com',
        mobile: '9100000014',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'b',
        roleCode: 'TCST10B',
        department: 'Stores and Dispatch',
        designation: 'Stores Team Member',
        reportsToName: 'Ayush Patil',
      },

      {
        name: 'Devraj Powar',
        email: 'devraj.el@example.com',
        mobile: '9100000022',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'b',
        roleCode: 'TCEL10B',
        department: 'Electronics',
        designation: 'Electronics Team Member',
        reportsToName: 'Sanket Kharade',
      },
      {
        name: 'Sakshi Bedage',
        email: 'sakshi.tm@example.com',
        mobile: '9100000024',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCSF10C',
        department: 'Software and Systems',
        designation: 'Software Team Member',
        reportsToName: 'Prathmesh Joshi',
      },
      {
        name: 'Suraj Ghodake',
        email: 'suraj.tm@example.com',
        mobile: '9100000018',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCCS10C',
        department: 'Customer Support',
        designation: 'Customer Support Team Member',
        reportsToName: 'Abhay Mudgal',
      },
      {
        name: 'Rushi Biranje',
        email: 'rushi.tm@example.com',
        mobile: '9100000019',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCCS10C',
        department: 'Customer Support',
        designation: 'Customer Support Team Member',
        reportsToName: 'Abhay Mudgal',
      },
      {
        name: 'Ganesh Naik',
        email: 'ganesh.st@example.com',
        mobile: '9100000025',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCST10C',
        department: 'Stores and Dispatch',
        designation: 'Quality Control Operator',
        reportsToName: 'Ayush Patil',
      },
      {
        name: 'Abhijeet Bobade',
        email: 'abhijeet.sm@example.com',
        mobile: '9100000026',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCSM10C',
        department: 'Sales and Marketing',
        designation: 'Marketing Associate',
        reportsToName: 'Indrajeet Rane',
      },
      {
        name: 'Sanskruti lad',
        email: 'sanskruti.hr@example.com',
        mobile: '9100000027',
        role: 'employee',
        levelName: 'Team Member',
        gradeCode: 'c',
        roleCode: 'TCHR10C',
        department: 'HR and Admin',
        designation: 'HR Coordinator',
        reportsToName: 'Rajshree Patil',
      },

      // Level 11: Trainees
      {
        name: 'Pratik Kelkar',
        email: 'pratik.ap@example.com',
        mobile: '9100000028',
        role: 'employee',
        levelName: 'Trainee',
        gradeCode: 'c',
        roleCode: 'TCAP11C',
        department: 'Accounts and Purchase',
        designation: 'Accounts Trainee',
        reportsToName: 'Apurva Otari',
      },
      {
        name: 'Chaitali Gujar',
        email: 'chaitali.el@example.com',
        mobile: '9100000029',
        role: 'employee',
        levelName: 'Trainee',
        gradeCode: 'c',
        roleCode: 'TCEL11C',
        department: 'Electronics',
        designation: 'Electronics Trainee',
        reportsToName: 'Sanket Kharade',
      },
      {
        name: 'Adesh Bhongale',
        email: 'adesh@example.com',
        mobile: '1000000000',
        role: 'employee',
        levelName: 'Trainee',
        gradeCode: 'a',
        roleCode: 'TCSF11A',
        department: 'Software and Systems',
        designation: 'ERP Software Trainee',
        reportsToName: 'Prathmesh Joshi',
      },
      {
        name: 'Sanika Sutar',
        email: 'sanika.hr@example.com',
        mobile: '9100000030',
        role: 'employee',
        levelName: 'Trainee',
        gradeCode: 'c',
        roleCode: 'TCHR11C',
        department: 'HR and Admin',
        designation: 'HR Trainee',
        reportsToName: 'Rajshree Patil',
      },
    ];

    // Map inserted employee documents by name
    const insertedUserMap = {};

    let empIndex = 1;
    for (const emp of structuredEmployees) {
      const levelDoc = levelDocMap[emp.levelName] || levelDocMap[emp.levelName?.toLowerCase()] || seededLevels.find(l => l.name === emp.levelName) || seededLevels[10];
      const gradeDoc = gradeDocMap[emp.gradeCode] || seededGrades[0];
      const reportsToUser = emp.reportsToName ? insertedUserMap[emp.reportsToName] : null;

      const empCode = emp.employeeIdCode || `${emp.roleCode || 'EMP'}_${String(empIndex++).padStart(3, '0')}`;

      const userDoc = await User.create({
        name: emp.name,
        email: emp.email,
        mobile: emp.mobile,
        password: 'password123',
        employeeIdCode: empCode,
        role: emp.role,
        roleLevel: levelDoc.levelNumber,
        roleGrade: gradeDoc.code,
        roleCode: emp.roleCode || empCode,
        levelRef: levelDoc._id,
        gradeRef: gradeDoc._id,
        department: emp.department,
        designation: emp.designation,
        reportsTo: reportsToUser ? reportsToUser._id : null,
        approver: reportsToUser ? reportsToUser._id : null,
        shift: shifts[0]._id,
        workingPlace: office._id,
        company: company._id,
        companyId: company._id,
        companyCode: 'TCSL',
        gender: 'Male',
        address: 'HQ Executive Block, Pratibha Nagar, Kolhapur',
        dob: new Date('1994-06-15'),
        bloodGroup: 'O+',
        status: 'active',
        joiningDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });

      insertedUserMap[emp.name] = userDoc;
    }

    console.log(`✓ ${Object.keys(insertedUserMap).length} Hierarchical Employees seeded.`);

    // --- SEED DEFAULT ROLE LOGINS FOR TESTING & PRODUCTION ---
    const defaultAccounts = [

      {
        name: 'TruCode Company Admin',
        email: 'admin@tcsl.com',
        mobile: '9888888881',
        employeeIdCode: 'ADM001',
        password: 'Admin@123',
        role: 'company_admin',
        roleCode: 'TCCA1',
        scope: 'COMPANY',
        companyId: companyId,
        company: companyId,
        companyCode: 'TCSL',
        department: 'Management',
        designation: 'Company Director',
        status: 'ACTIVE',
      },
      {
        name: 'TruCode HR Admin',
        email: 'hr@tcsl.com',
        mobile: '9888888882',
        employeeIdCode: 'HR001',
        password: 'Admin@123',
        role: 'hr_admin',
        roleCode: 'TCSF2A',
        scope: 'COMPANY',
        companyId: companyId,
        company: companyId,
        companyCode: 'TCSL',
        department: 'Human Resources',
        designation: 'HR Manager',
        status: 'ACTIVE',
      },
      {
        name: 'TruCode Store Admin',
        email: 'store@tcsl.com',
        mobile: '9888888883',
        employeeIdCode: 'STR001',
        password: 'Admin@123',
        role: 'store_admin',
        roleCode: 'TCSTR1',
        scope: 'COMPANY',
        companyId: companyId,
        company: companyId,
        companyCode: 'TCSL',
        department: 'Store & Inventory',
        designation: 'Store Manager',
        status: 'ACTIVE',
      },
      {
        name: 'TruCode Account Admin',
        email: 'account@tcsl.com',
        mobile: '9888888884',
        employeeIdCode: 'ACC001',
        password: 'Admin@123',
        role: 'account_admin',
        roleCode: 'TCACC1',
        scope: 'COMPANY',
        companyId: companyId,
        company: companyId,
        companyCode: 'TCSL',
        department: 'Finance & Accounts',
        designation: 'Finance Head',
        status: 'ACTIVE',
      }
    ];

    const Employee = require('../models/Employee');
    for (const acc of defaultAccounts) {
      let existing = await User.findOne({
        $or: [{ email: acc.email }, { employeeIdCode: acc.employeeIdCode }]
      });
      if (!existing) {
        existing = await User.create(acc);
        console.log(`✔ Created role login: ${acc.email} (${acc.employeeIdCode}) - ${acc.role}`);
      }

      if (acc.scope !== 'GLOBAL') {
        await Employee.create({
          companyId: companyId,
          employeeId: acc.employeeIdCode,
          userId: existing._id,
          name: acc.name,
          email: acc.email,
          phone: acc.mobile,
          status: 'ACTIVE',
        }).catch(err => console.log('Notice: HR employee record exists:', err.message));
      }
    }

    const employees = await User.find();

    // Wire up Business Responsibilities to Matrix Tree Users
    const pritmanDige = employees.find(e => e.name === 'Preetam Dige');
    const ayushStore = employees.find(e => e.name === 'Ayush');
    const apurvaAcc = employees.find(e => e.name === 'Apurva');
    const minalPatil = employees.find(e => e.name === 'Minal Patil');
    const pradnyaPise = employees.find(e => e.name === 'Pradnya Pise');
    const imranShaikh = employees.find(e => e.name === 'Imran Shaikh');
    const rahulK = employees.find(e => e.name === 'Rahul K');

    if (ayushStore || pritmanDige) {
      const storeUsers = [ayushStore?._id, pritmanDige?._id].filter(Boolean);
      await Responsibility.updateOne({ code: 'STORE_APPROVER' }, { assignedEmployees: storeUsers });
      await Responsibility.updateOne({ code: 'INVENTORY_CONTROLLER' }, { assignedEmployees: storeUsers });
    }
    if (apurvaAcc || pritmanDige) {
      const finUsers = [apurvaAcc?._id, pritmanDige?._id].filter(Boolean);
      await Responsibility.updateOne({ code: 'FINANCE_APPROVER' }, { assignedEmployees: finUsers });
      await Responsibility.updateOne({ code: 'EXPENSE_AUDITOR' }, { assignedEmployees: finUsers });
    }
    if (minalPatil || pradnyaPise) {
      const mgtUsers = [minalPatil?._id, pradnyaPise?._id].filter(Boolean);
      await Responsibility.updateOne({ code: 'MANAGEMENT_APPROVER' }, { assignedEmployees: mgtUsers });
    }
    if (imranShaikh) {
      await Responsibility.updateOne({ code: 'SITE_INCHARGE' }, { assignedEmployees: [imranShaikh._id] });
    }
    if (rahulK) {
      await Responsibility.updateOne({ code: 'HANDLER' }, { assignedEmployees: [rahulK._id] });
    }

    // 5. Enhanced leaves seeding (Past, Current, Future, Half-Day, All Statuses)
    // We generate all leave records FIRST so they can be cross-referenced with attendance records
    const leaveRecords = [];
    const leaveTypes = ['Sick Leave', 'Casual Leave', 'Paid Leave', 'Unpaid Leave'];
    const statuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
    const durations = ['Full Day', 'Half Day'];

    for (const emp of employees) {
      // 1. Past Leaves (Last 60 days) - for historical analytics
      for (let i = 0; i < 2; i++) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - (Math.floor(Math.random() * 50) + 10)); // 10 to 60 days ago
        if (pastDate < new Date(emp.joiningDate)) continue;
        const endPastDate = new Date(pastDate);
        if (Math.random() < 0.2) endPastDate.setDate(pastDate.getDate() + 1);

        // Past leaves must be resolved (Approved, Rejected, Cancelled), never Pending
        const pastStatuses = ['Approved', 'Rejected', 'Cancelled'];
        const status = pastStatuses[Math.floor(Math.random() * pastStatuses.length)];

        // Request date must be in the past, e.g. 1 to 5 days before the leave starts
        let appliedDate = new Date(pastDate);
        appliedDate.setDate(appliedDate.getDate() - (Math.floor(Math.random() * 5) + 1));
        if (appliedDate < new Date(emp.joiningDate)) appliedDate = new Date(emp.joiningDate);

        leaveRecords.push({
          companyId: emp.companyId || companyId,
          company: emp.companyId || companyId,
          user: emp._id,
          leaveType: leaveTypes[Math.floor(Math.random() * leaveTypes.length)],
          startDate: pastDate,
          endDate: endPastDate,
          duration: durations[Math.floor(Math.random() * durations.length)],
          startTime: '09:00',
          endTime: '13:00',
          reason: 'Historical leave for testing counts',
          status: status,
          createdAt: appliedDate,
          appliedOn: appliedDate
        });
      }

      // 2. Recent/Today Leaves (Today +/- 5 days)
      for (let i = 0; i < 1; i++) {
        const currDate = new Date();
        currDate.setDate(currDate.getDate() + (Math.floor(Math.random() * 10) - 5));
        if (currDate < new Date(emp.joiningDate)) continue;
        const endCurrDate = new Date(currDate);

        // Check if the date is in the past; if so, it cannot be Pending
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(currDate);
        checkDate.setHours(0, 0, 0, 0);
        const isPast = checkDate < today;

        let status;
        if (isPast) {
          const pastStatuses = ['Approved', 'Rejected', 'Cancelled'];
          status = pastStatuses[Math.floor(Math.random() * pastStatuses.length)];
        } else {
          status = statuses[Math.floor(Math.random() * statuses.length)];
        }

        // Request date: always before start date
        let appliedDate = new Date(currDate);
        appliedDate.setDate(appliedDate.getDate() - (Math.floor(Math.random() * 5) + 1));

        // For future leaves, allow some to be requested today, others in the past
        if (currDate > new Date()) {
          const randOption = Math.random();
          if (randOption < 0.5) {
            appliedDate = new Date(); // Applied today
          } else {
            appliedDate = new Date(); // Applied in the past (1 to 5 days ago)
            appliedDate.setDate(appliedDate.getDate() - (Math.floor(Math.random() * 5) + 1));
          }
        }
        if (appliedDate < new Date(emp.joiningDate)) appliedDate = new Date(emp.joiningDate);

        leaveRecords.push({
          companyId: emp.companyId || companyId,
          company: emp.companyId || companyId,
          user: emp._id,
          leaveType: leaveTypes[Math.floor(Math.random() * leaveTypes.length)],
          startDate: currDate,
          endDate: endCurrDate,
          duration: durations[Math.floor(Math.random() * durations.length)],
          startTime: '10:00',
          endTime: '14:00',
          reason: 'Recent requirement',
          status: status,
          createdAt: appliedDate,
          appliedOn: appliedDate
        });
      }

      // 3. Future Leaves (Next 3 months)
      for (let i = 1; i <= 1; i++) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + i);
        futureDate.setDate(Math.floor(Math.random() * 25) + 1);
        const endFutureDate = new Date(futureDate);

        // Request date: 50% today, 50% in the past (1 to 10 days ago)
        let appliedDate = new Date();
        const randOption = Math.random();
        if (randOption >= 0.5) {
          appliedDate.setDate(appliedDate.getDate() - (Math.floor(Math.random() * 10) + 1));
        }
        if (appliedDate < new Date(emp.joiningDate)) appliedDate = new Date(emp.joiningDate);

        leaveRecords.push({
          companyId: emp.companyId || companyId,
          company: emp.companyId || companyId,
          user: emp._id,
          leaveType: leaveTypes[Math.floor(Math.random() * leaveTypes.length)],
          startDate: futureDate,
          endDate: endFutureDate,
          duration: durations[Math.floor(Math.random() * durations.length)],
          startTime: '13:00',
          endTime: '17:00',
          reason: 'Future planned absence',
          status: 'Pending',
          createdAt: appliedDate,
          appliedOn: appliedDate
        });
      }
    }

    // 6. Generate History (Last 30 Days)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const attendanceRecords = [];

    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      date.setUTCDate(date.getUTCDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const isWeekend = date.getUTCDay() === 0; // Skip Sundays

      for (const emp of employees) {
        // 1. Skip if date is before employee joining date
        const empJoined = new Date(emp.joiningDate);
        empJoined.setUTCHours(0, 0, 0, 0);
        const currentD = new Date(date);
        currentD.setUTCHours(0, 0, 0, 0);

        if (currentD < empJoined) continue;

        // 2. SPECIAL CASE: Adesh Bhongale — only seed the last 2 days of history,
        //    never seed today so they always appear fresh/neutral on the current day.
        if (emp.name === 'Adesh Bhongale') {
          if (d === 0 || d > 2) continue; // Skip today and anything older than 2 days
        }

        const holidayDates = ['2026-01-01', '2026-05-01', '2026-08-15', '2026-10-02', '2026-12-25', '2026-05-27'];
        const isHoliday = holidayDates.includes(dateStr);

        if (isWeekend || isHoliday) continue;

        const empIndex = employees.indexOf(emp);

        // Use the employee's actual assigned shift from their profile to avoid shift timing mismatch
        const empShiftId = emp.shift ? emp.shift.toString() : null;
        const shift = shifts.find(s => s._id.toString() === empShiftId) || shifts[0];

        // Check if there is an approved leave overlapping this date for this employee
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        const matchingLeave = leaveRecords.find(lr => {
          if (lr.user.toString() !== emp._id.toString()) return false;
          if (lr.status !== 'Approved') return false;

          const start = new Date(lr.startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(lr.endDate);
          end.setHours(0, 0, 0, 0);

          return checkDate >= start && checkDate <= end;
        });

        if (matchingLeave) {
          if (matchingLeave.duration === 'Full Day') {
            // Full-day leave: skip creating any attendance record for this day.
            // The frontend will dynamically merge this leave to show it.
            continue;
          } else if (matchingLeave.duration === 'Half Day') {
            // Half-day leave: seed a Half Day attendance record (exactly 4 working hours)
            const [sHour, sMin] = shift.startTime.split(':').map(Number);
            const targetY = date.getUTCFullYear();
            const targetM = date.getUTCMonth();
            const targetD = date.getUTCDate();

            // Shift startTime, on time check in
            const punchIn = createDateFromIST(targetY, targetM, targetD, sHour, sMin, 0);
            const punchOut = new Date(punchIn.getTime() + (4.0 * 60 * 60 * 1000));

            const breaks = [];
            const tempAtt = {
              punchIn: { time: punchIn },
              punchOut: { time: punchOut },
              breaks: breaks,
              shiftInfo: shift
            };

            const isSeedOutside = Math.random() < 0.10;
            const latOffset = 0.05;
            const lngOffset = 0.05;
            const pinLat = isSeedOutside ? office.latitude + latOffset : office.latitude;
            const pinLng = isSeedOutside ? office.longitude + lngOffset : office.longitude;
            const poutLat = isSeedOutside ? office.latitude + latOffset : office.latitude;
            const poutLng = isSeedOutside ? office.longitude + lngOffset : office.longitude;

            const trackingLogs = [];
            let totalDistanceKm = 0;
            const durationMs = punchOut.getTime() - punchIn.getTime();
            let currentTime = new Date(punchIn);
            let lastLat = pinLat;
            let lastLng = pinLng;

            const totalLogCount = 30;
            for (let i = 0; i < totalLogCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              const distanceMeters = 70 + (Math.random() * 25);
              const jumpDeg = distanceMeters * 0.000009;

              const currentLat = lastLat + (jumpDeg * Math.cos(angle));
              const currentLng = lastLng + (jumpDeg * Math.sin(angle));

              const segmentDist = geoService.calculateDistance(lastLat, lastLng, currentLat, currentLng);
              totalDistanceKm += segmentDist;

              currentTime = new Date(currentTime.getTime() + (durationMs / (totalLogCount + 5)));
              const isPointOutside = geoService.calculateDistance(office.latitude, office.longitude, currentLat, currentLng) > (office.radius / 1000);

              trackingLogs.push({
                time: new Date(currentTime),
                latitude: currentLat,
                longitude: currentLng,
                address: `Internal Road Lane ${Math.floor(i / 5) + 1}, ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`,
                isOutside: isPointOutside,
                distanceFromPrevious: parseFloat((segmentDist * 1000).toFixed(2))
              });

              lastLat = currentLat;
              lastLng = currentLng;
            }

            const finalLog = trackingLogs[trackingLogs.length - 1];
            const attendanceId = new mongoose.Types.ObjectId();

            attendanceRecords.push({
              _id: attendanceId,
              companyId: emp.companyId || companyId,
              company: emp.companyId || companyId,
              user: emp._id,
              date: date,
              status: 'Half Day',
              punchIn: {
                time: punchIn,
                location: { latitude: pinLat, longitude: pinLng, address: isSeedOutside ? 'Outside Geofence Area' : office.address },
                selfie: `https://i.pravatar.cc/150?u=${emp._id}in${d}`,
                isOutside: isSeedOutside
              },
              punchOut: {
                time: punchOut,
                location: { latitude: poutLat, longitude: poutLng, address: isSeedOutside ? 'Outside Geofence Area' : office.address },
                selfie: `https://i.pravatar.cc/150?u=${emp._id}out${d}`,
                isOutside: isSeedOutside
              },
              workingHours: (shift.workingHours || 8) / 2, // Exactly half shift hours
              lateTime: 0,
              isOutside: isSeedOutside || finalLog.isOutside,
              lastTrackedLocation: {
                latitude: finalLog.latitude,
                longitude: finalLog.longitude,
                address: finalLog.address,
                time: finalLog.time
              },
              distance: parseFloat(totalDistanceKm.toFixed(6)),
              totalDistance: parseFloat(totalDistanceKm.toFixed(6)),
              shiftInfo: { name: shift.name, startTime: shift.startTime },
              breaks: breaks,
              isLate: false,
              isHalfDay: true,
              signalStatus: 'offline'
            });
            continue;
          }
        }

        // Random Status Picker
        const rand = Math.random();

        if (rand < 0.12) { // 12% Leave
          const leaveStatusRand = Math.random();
          let leaveStatus = 'Approved';
          if (leaveStatusRand < 0.2) {
            // Pending leaves are only allowed for today (d === 0) or future dates, not past history
            leaveStatus = d === 0 ? 'Pending' : 'Approved';
          }
          else if (leaveStatusRand < 0.4) leaveStatus = 'Rejected';
          else if (leaveStatusRand < 0.5) leaveStatus = 'Cancelled';

          const leaveTypeRand = Math.random();
          let leaveType = 'Casual Leave';
          if (leaveTypeRand < 0.3) leaveType = 'Sick Leave';
          else if (leaveTypeRand < 0.4) leaveType = 'Paid Leave';
          else if (leaveTypeRand < 0.5) leaveType = 'Unpaid Leave';

          leaveRecords.push({
            companyId: emp.companyId || companyId,
            company: emp.companyId || companyId,
            user: emp._id,
            leaveType: leaveType,
            startDate: date,
            endDate: date,
            reason: leaveStatusRand < 0.5 ? 'Feeling unwell' : 'Personal work',
            status: leaveStatus
          });
          if (leaveStatus === 'Approved') continue;
        }

        else if (rand < 0.18) { // 6% no-show — seed explicit Absent record
          attendanceRecords.push({
            _id: new mongoose.Types.ObjectId(),
            companyId: emp.companyId || companyId,
            company: emp.companyId || companyId,
            user: emp._id,
            date: date,
            punchIn: null,
            punchOut: null,
            status: 'Absent',
            workingHours: 0,
            lateTime: 0,
            isLate: false,
            isHalfDay: false,
            isOutside: false,
            distance: 0,
            totalDistance: 0,
            shiftInfo: {
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
              requiredHours: shift.workingHours,
              gracePeriod: shift.gracePeriod,
              halfDayAfter: shift.halfDayAfter
            },
            signalStatus: 'offline'
          });
          continue;
        }


        // Present/Late/Half-Day (never seed 'Absent' status here)
        // Parse shift times
        const [sHour, sMin] = shift.startTime.split(':').map(Number);
        const [eHour, eMin] = shift.endTime.split(':').map(Number);

        const targetY = date.getUTCFullYear();
        const targetM = date.getUTCMonth();
        const targetD = date.getUTCDate();

        let punchIn;
        const pRand = Math.random();

        // Parse halfDayAfter cutoff
        let halfDayAfterStr = shift.halfDayAfter;
        if (!halfDayAfterStr || halfDayAfterStr === "00:00") {
          const defH = (sHour + 3) % 24;
          const defM = sMin;
          halfDayAfterStr = `${defH.toString().padStart(2, '0')}:${defM.toString().padStart(2, '0')}`;
        }
        const [hH, hM] = halfDayAfterStr.split(':').map(Number);
        let cutoffMinutes = (hH * 60 + hM) - (sHour * 60 + sMin);
        if (cutoffMinutes < 0) cutoffMinutes += 1440;

        if (pRand < 0.10) { // Late (10%) - 1 to 2 hours late (60 to 120 mins) but not past half-day cutoff
          const minLate = (shift.gracePeriod || 15) + 1;
          const maxLate = Math.min(120, cutoffMinutes - 1);
          const lateMinutes = maxLate > minLate ? minLate + Math.floor(Math.random() * (maxLate - minLate + 1)) : minLate;
          punchIn = createDateFromIST(targetY, targetM, targetD, sHour, sMin + lateMinutes, 0);
        } else if (pRand < 0.20) { // Half Day (10%) - after cutoff but not more than 4 hours (240 mins) late
          const minHalfDayLate = cutoffMinutes + 1;
          const maxHalfDayLate = 240;
          const halfDayLateMinutes = minHalfDayLate + (maxHalfDayLate > minHalfDayLate ? Math.floor(Math.random() * (maxHalfDayLate - minHalfDayLate)) : 0);
          punchIn = createDateFromIST(targetY, targetM, targetD, sHour, sMin + halfDayLateMinutes, 0);
        } else { // On Time — Present (80%) - 5 mins to 1 hour early (before start time)
          const earlyMinutes = 5 + Math.floor(Math.random() * 55);
          punchIn = createDateFromIST(targetY, targetM, targetD, sHour, sMin - earlyMinutes, 0);
        }

        // ── FIX: Ensure 'Today' records are in the past so hours are non-zero ──
        if (dateStr === todayStr) {
          // If punchIn is in the future relative to now, shift it back by 4 hours
          const currentRealTime = new Date();
          if (punchIn > currentRealTime) {
            punchIn.setTime(currentRealTime.getTime() - (4 * 60 * 60 * 1000)); // 4 hours ago
          }
        }

        // ── Punch Out Logic ──
        let punchOut;
        const isHalfDayByRandom = pRand >= 0.10 && pRand < 0.20;
        if (isHalfDayByRandom) {
          // Half day duration is 3.5 to 4.5 hours
          const durationHours = 3.5 + Math.random() * 1.0;
          punchOut = new Date(punchIn.getTime() + (durationHours * 60 * 60 * 1000));
        } else {
          // Full day: punch-out is near the scheduled shift end time (before/after 1-2 hours)
          let shiftEnd = createDateFromIST(targetY, targetM, targetD, eHour, eMin);
          if (eHour < sHour || (eHour === sHour && eMin < sMin)) {
            shiftEnd = createDateFromIST(targetY, targetM, targetD + 1, eHour, eMin);
          }
          // Offset of -120 to +120 minutes (before or after 1-2 hours)
          const offsetMinutes = -120 + Math.floor(Math.random() * 241);
          punchOut = new Date(shiftEnd.getTime() + (offsetMinutes * 60000));

          // Ensure punchOut is after punchIn
          if (punchOut <= punchIn) {
            punchOut = new Date(punchIn.getTime() + (6 + Math.random() * 4) * 60 * 60 * 1000);
          }
        }



        // Generate Random Breaks (1-3 sessions)
        const breakCount = Math.floor(Math.random() * 3) + 1;
        const breaks = [];
        let totalBreakDuration = 0;

        for (let b = 0; b < breakCount; b++) {
          const bDuration = 15 + Math.floor(Math.random() * 30); // 15-45 mins
          const bStartOffset = (3 + b * 2) * 60 * 60000; // Spread breaks (3h, 5h, 7h after punch in)
          const bStart = new Date(punchIn.getTime() + bStartOffset);
          const bEnd = new Date(bStart.getTime() + bDuration * 60000);

          breaks.push({
            startTime: bStart,
            endTime: bEnd,
            duration: bDuration
          });
          totalBreakDuration += bDuration;
        }

        // Use Centralized Services for calculation
        const tempAtt = {
          date: date,
          punchIn: { time: punchIn },
          punchOut: { time: punchOut },
          breaks: breaks,
          shiftInfo: shift
        };

        const status = statsService.resolveStatus(tempAtt, emp);
        // Never seed punch-in/out record for Absent employees — only the explicit Absent block above does that
        if (status === 'Absent') continue;
        const isHalfDay = status === 'Half Day';
        const isLate = status === 'Late';
        const lateTimeVal = statsService.calculateLateTime({ date: date, punchIn: { time: punchIn } }, shift);
        let workingHoursVal = statsService.calculateWorkingHours(tempAtt);
        // Half Day: fix working hours to exactly half the required shift hours (e.g. 4hr for 8hr shift)
        if (isHalfDay) workingHoursVal = (shift.workingHours || 8) / 2;

        const isSeedOutside = Math.random() < 0.10;
        const latOffset = 0.05;
        const lngOffset = 0.05;
        const pinLat = isSeedOutside ? office.latitude + latOffset : office.latitude;
        const pinLng = isSeedOutside ? office.longitude + lngOffset : office.longitude;
        const poutLat = isSeedOutside ? office.latitude + latOffset : office.latitude;
        const poutLng = isSeedOutside ? office.longitude + lngOffset : office.longitude;

        const trackingLogs = [];
        let totalDistanceKm = 0;
        const durationMs = punchOut.getTime() - punchIn.getTime();
        let currentTime = new Date(punchIn);
        let lastLat = pinLat;
        let lastLng = pinLng;

        // --- ULTRA-DENSE MICRO-TRACKING (Exactly 30 points, 1-10m increments) ---
        const totalLogCount = 30;
        for (let i = 0; i < totalLogCount; i++) {
          // Jump between 70m and 95m (to total 2-3 km over 30 points)
          const angle = Math.random() * Math.PI * 2;
          const distanceMeters = 70 + (Math.random() * 25);
          const jumpDeg = distanceMeters * 0.000009;

          const currentLat = lastLat + (jumpDeg * Math.cos(angle));
          const currentLng = lastLng + (jumpDeg * Math.sin(angle));

          const segmentDist = geoService.calculateDistance(lastLat, lastLng, currentLat, currentLng);
          totalDistanceKm += segmentDist;

          // Increment time incrementally across the shift
          currentTime = new Date(currentTime.getTime() + (durationMs / (totalLogCount + 5)));

          const isPointOutside = geoService.calculateDistance(office.latitude, office.longitude, currentLat, currentLng) > (office.radius / 1000);

          trackingLogs.push({
            time: new Date(currentTime),
            latitude: currentLat,
            longitude: currentLng,
            address: `Internal Road Lane ${Math.floor(i / 5) + 1}, ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`,
            isOutside: isPointOutside,
            distanceFromPrevious: parseFloat((segmentDist * 1000).toFixed(2))
          });

          lastLat = currentLat;
          lastLng = currentLng;
        }
        // --- END ULTRA-DENSE MICRO-TRACKING ---

        const finalLog = trackingLogs[trackingLogs.length - 1];
        const attendanceId = new mongoose.Types.ObjectId();

        attendanceRecords.push({
          _id: attendanceId,
          companyId: emp.companyId || companyId,
          company: emp.companyId || companyId,
          user: emp._id,
          date: date,
          status: status,
          punchIn: {
            time: punchIn,
            location: { latitude: pinLat, longitude: pinLng, address: isSeedOutside ? 'Outside Geofence Area' : office.address },
            selfie: `https://i.pravatar.cc/150?u=${emp._id}in${d}`,
            isOutside: isSeedOutside
          },
          punchOut: {
            time: punchOut,
            location: { latitude: poutLat, longitude: poutLng, address: isSeedOutside ? 'Outside Geofence Area' : office.address },
            selfie: `https://i.pravatar.cc/150?u=${emp._id}out${d}`,
            isOutside: isSeedOutside
          },
          // Canonical service computes this — Half Day is capped to half shift hours
          workingHours: parseFloat(workingHoursVal.toFixed(2)),
          lateTime: lateTimeVal,
          isOutside: isSeedOutside || finalLog.isOutside,
          lastTrackedLocation: {
            latitude: finalLog.latitude,
            longitude: finalLog.longitude,
            address: finalLog.address,
            time: finalLog.time
          },
          // STANDARDIZED: both `distance` and `totalDistance` always set to same value
          distance: parseFloat(totalDistanceKm.toFixed(6)),
          totalDistance: parseFloat(totalDistanceKm.toFixed(6)),
          shiftInfo: { name: shift.name, startTime: shift.startTime },
          breaks: breaks,
          isLate: lateTimeVal > 0,
          isHalfDay: isHalfDay,
          signalStatus: 'offline'
        });
      }
    }

    // Leaves are pre-seeded consistently before generating attendance history

    // Safe Chunked Insertions to prevent connection timeouts/drops
    console.log(`Saving ${attendanceRecords.length} Attendance records in batches...`);
    await saveInBatches(Attendance, attendanceRecords, 50);

    console.log(`Saving ${leaveRecords.length} Leave records in batches...`);
    await saveInBatches(Leave, leaveRecords, 50);

    // 6.5 Seed Customers (10 Enterprise Customers)
    console.log('Seeding Customers...');
    const adminUser = await safeDbCall(() => User.findOne({ role: 'admin' }), 'Find admin') || employees[0];

    const testCustomers = [
      {
        customerCode: 'CUST-10001',
        customerName: 'Amul Food & Dairy Enterprise Pvt Ltd',
        industry: 'Dairy & Food Processing',
        creditPeriod: 30,
        email: 'contact@amuldairy.co.in',
        phone: '+91 22 67890000',
        customerSince: new Date('2021-03-15'),
        remarks: 'Mega dairy processing plant running Milk, Curd, Cheese, Butter and Powdered Milk automated production lines.',
        contactPerson: 'Rajesh Sharma',
        mobile: '+91 9822011223',
        address: 'Plot 15, Anand Dairy Industrial Zone, Anand, Gujarat 388001',
        latitude: 22.5645,
        longitude: 72.9289,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Plot 15, Anand Dairy Industrial Zone', addressLine2: 'Near Express Highway Toll', area: 'Anand Food Processing Zone', city: 'Anand', district: 'Anand', state: 'Gujarat', country: 'India', pincode: '388001' },
        primaryContact: { contactPerson: 'Rajesh Sharma', designation: 'Vice President - Plant Operations', mobileNumber: '+91 9822011223', email: 'r.sharma@amuldairy.co.in', landline: '+91 22 67890010', whatsApp: '+91 9822011223' },
        departmentContacts: {
          purchase: [{ name: 'Amit Varma', designation: 'General Manager - Purchase', mobile: '+91 9822044556', email: 'purchase@amuldairy.co.in' }],
          accounts: [{ name: 'Priya Kulkarni', designation: 'Chief Financial Officer', mobile: '+91 9822077889', email: 'accounts@amuldairy.co.in' }],
          production: [{ name: 'Sunil Deshmukh', designation: 'Production Head - Dairy Division', mobile: '+91 9822088990', email: 'production@amuldairy.co.in' }],
          maintenance: [{ name: 'Rohit Patil', designation: 'Chief Automation Engineer', mobile: '+91 9822099112', email: 'maint@amuldairy.co.in' }]
        },
        financialInfo: { panNumber: 'AAACA1234F', gstNumber: '24AAACA1234F1Z1', dateOfIncorporation: new Date('1998-04-12'), msmeNumber: 'UDYAM-GJ-01-0012345', msmeStatus: 'Medium', msmeCategory: 'large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Certificate_Amul_Dairy.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Card_Amul_Dairy.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('1998-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Udyam_Amul.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'HDFC Bank Ltd', accountNumber: '50200012345678', ifscCode: 'HDFC0000104', accountType: 'Current', bankAddress: 'Main Commercial Branch, Anand GIDC, Anand, Gujarat' },
        productionSections: [
          {
            sectionName: 'Milk Processing Section',
            location: 'Dairy Complex Bay 1 - Ground Floor',
            installedProducts: [
              { productId: 'PRINTER-MILK-01', productName: 'High Speed Fiber Laser Printer LM500', modelNumber: 'LM500-MILK-LASER', machineSerialNo: 'SN-LM500-L01' }
            ],
            subSections: [
              { subSectionName: 'Pouch Filling Sub-Section', installedProducts: [{ productId: 'GPS-01', productName: 'TruCode Smart GPS Tracker Node', modelNumber: 'GPS-Pro 5000', machineSerialNo: 'SN-GPS5K-001' }] }
            ]
          }
        ]
      },
      {
        customerCode: 'CUST-10002',
        customerName: 'Tata Motors Heavy Equipment Plant',
        industry: 'Automobile & Transport Engineering',
        creditPeriod: 45,
        email: 'procurement@tatamotors.com',
        phone: '+91 20 66112200',
        customerSince: new Date('2021-06-10'),
        remarks: 'Major commercial vehicle chassis assembly line equipped with VIN pin marking & laser systems.',
        contactPerson: 'Vikram Joshi',
        mobile: '+91 9960123456',
        address: 'Pimpri Industrial Zone, Near Telco Circle, Pune, Maharashtra 411018',
        latitude: 18.6298,
        longitude: 73.7997,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Pimpri Industrial Zone', addressLine2: 'Near Telco Main Gate', area: 'Pimpri Telco Complex', city: 'Pune', district: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411018' },
        primaryContact: { contactPerson: 'Vikram Joshi', designation: 'Head - Tooling & Automation', mobileNumber: '+91 9960123456', email: 'v.joshi@tatamotors.com', landline: '+91 20 66112210', whatsApp: '+91 9960123456' },
        departmentContacts: {
          purchase: [{ name: 'Anand Shinde', designation: 'Sr Purchase Manager', mobile: '+91 9960999888', email: 'anand@tatamotors.com' }],
          accounts: [{ name: 'Suhas Kulkarni', designation: 'Accounts Manager', mobile: '+91 9960999777', email: 'accounts@tatamotors.com' }],
          production: [{ name: 'Nitin Mane', designation: 'Production Supervisor', mobile: '+91 9960999666', email: 'production@tatamotors.com' }],
          maintenance: [{ name: 'Pravin Pawar', designation: 'Plant Maintenance Lead', mobile: '+91 9960999555', email: 'maint@tatamotors.com' }]
        },
        financialInfo: { panNumber: 'AAACT0000A', gstNumber: '27AAACT0000A1Z2', msmeNumber: 'UDYAM-MH-12-0099887', msmeCategory: 'very large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Tata_Motors_Pimpri.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Tata_Motors.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Tata_Motors.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'State Bank of India', accountNumber: '100200300400', ifscCode: 'SBIN0000300', accountType: 'Current', bankAddress: 'Main Commercial Branch, Fort, Mumbai, MH' },
        productionSections: [
          { sectionName: 'Chassis Body Shop', location: 'Block C Telco Assembly', installedProducts: [{ productId: 'SCAN-01', productName: 'Industrial Handheld Barcode Scanner', modelNumber: 'ScanMax-2D-Rugged', machineSerialNo: 'SN-SCMAX-901' }] }
        ]
      },
      {
        customerCode: 'CUST-10003',
        customerName: 'Omni Retail Outlets Pvt Ltd',
        industry: 'Retail & Consumer Goods',
        creditPeriod: 60,
        email: 'contact@omniretail.com',
        phone: '+91 80 44556677',
        customerSince: new Date('2022-01-20'),
        remarks: 'Chain of retail outlets across South India equipped with barcode readers and RFID access.',
        contactPerson: 'Vikram Mehta',
        mobile: '+91 9988776655',
        address: 'MG Road Industrial Layout, Bengaluru, Karnataka 560001',
        latitude: 12.9716,
        longitude: 77.5946,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'MG Road Layout', addressLine2: 'Near Metro', area: 'CBD', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', country: 'India', pincode: '560001' },
        primaryContact: { contactPerson: 'Vikram Mehta', designation: 'General Manager', mobileNumber: '+91 9988776655', email: 'vikram@omniretail.com' },
        departmentContacts: {
          purchase: [{ name: 'Sanjay Hegde', designation: 'Head of Procurement', mobile: '+91 9988771122', email: 'sanjay@omniretail.com' }],
          accounts: [{ name: 'Deepa Rao', designation: 'Finance Controller', mobile: '+91 9988772233', email: 'finance@omniretail.com' }],
          production: [{ name: 'Ramesh Reddy', designation: 'Supply Chain Manager', mobile: '+91 9988773344', email: 'supply@omniretail.com' }],
          maintenance: [{ name: 'Kiran Kumar', designation: 'IT & POS Lead', mobile: '+91 9988774455', email: 'support@omniretail.com' }]
        },
        financialInfo: { panNumber: 'AAACO1111B', gstNumber: '29AAACO1111B1Z3', msmeNumber: 'UDYAM-KA-02-0055443', msmeCategory: 'mid' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Omni_Retail.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Omni_Retail.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Omni_Retail.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'ICICI Bank', accountNumber: '000405001234', ifscCode: 'ICIC0000004', accountType: 'Current', bankAddress: 'MG Road Branch, Bengaluru, Karnataka' },
        productionSections: [
          { sectionName: 'Central Dispatch Hub', location: 'Warehouse Building B', installedProducts: [{ productId: 'RFID-01', productName: 'RFID Smart Badge Card Reader', modelNumber: 'RFID-GateControl-100', machineSerialNo: 'SN-RFID-G101' }] }
        ]
      },
      {
        customerCode: 'CUST-10004',
        customerName: 'Sunitha Multi-Specialty Hospital',
        industry: 'Healthcare & Medical Devices',
        creditPeriod: 30,
        email: 'contact@sunithahospital.com',
        phone: '+91 863 2233445',
        customerSince: new Date('2020-11-05'),
        remarks: '500-bed multi-specialty hospital equipped with biometric access control terminals.',
        contactPerson: 'Dr. Sunitha Rao',
        mobile: '9876543210',
        address: 'Arundelpet 11/2, Guntur, Andhra Pradesh 522002',
        latitude: 16.305921,
        longitude: 80.439831,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Arundelpet 11/2', addressLine2: 'Main Road', city: 'Guntur', district: 'Guntur', state: 'Andhra Pradesh', country: 'India', pincode: '522002' },
        primaryContact: { contactPerson: 'Dr. Sunitha Rao', designation: 'Medical Director', mobileNumber: '9876543210', email: 'dr.sunitha@sunithahospital.com' },
        departmentContacts: {
          purchase: [{ name: 'Venkatesh Babu', designation: 'Bio-Medical Purchase Lead', mobile: '+91 9876543211', email: 'purchase@sunithahospital.com' }],
          accounts: [{ name: 'Lakshmi Prasad', designation: 'Accounts Manager', mobile: '+91 9876543212', email: 'accounts@sunithahospital.com' }],
          production: [{ name: 'Dr. Srinivas Rao', designation: 'Clinical Operations Head', mobile: '+91 9876543213', email: 'ops@sunithahospital.com' }],
          maintenance: [{ name: 'Nageswara Rao', designation: 'Facility Maintenance Engineer', mobile: '+91 9876543214', email: 'maint@sunithahospital.com' }]
        },
        financialInfo: { panNumber: 'AAACS8899D', gstNumber: '37AAACS8899D1Z4', msmeNumber: 'UDYAM-AP-04-0011223', msmeCategory: 'small' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Sunitha_Hospital.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Sunitha_Hospital.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Sunitha_Hospital.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'Axis Bank', accountNumber: '91201009876543', ifscCode: 'UTIB0000123', accountType: 'Current', bankAddress: 'Arundelpet Branch, Guntur, AP' },
        productionSections: [
          { sectionName: 'Emergency & OT Access Control', location: 'Floor 2 OT Wing', installedProducts: [{ productId: 'BIO-01', productName: 'TruCode Biometric Terminal X1', modelNumber: 'BioX1-FaceSense', machineSerialNo: 'SN-BIOX1-F881' }] }
        ]
      },
      {
        customerCode: 'CUST-10005',
        customerName: 'Bharat Forge Metal & Heavy Forging Ltd',
        industry: 'Heavy Engineering & Metallurgical',
        creditPeriod: 90,
        email: 'info@bharatforge.com',
        phone: '+91 20 67042211',
        customerSince: new Date('2019-04-01'),
        remarks: 'Global leader in high-precision forging and automotive drivetrain component manufacturing.',
        contactPerson: 'Karan Kalyani',
        mobile: '+91 9823098765',
        address: 'Mundhwa Industrial Area, Pune, Maharashtra 411036',
        latitude: 18.5362,
        longitude: 73.9168,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Mundhwa Industrial Estate', addressLine2: 'Pune Cantonment', city: 'Pune', district: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411036' },
        primaryContact: { contactPerson: 'Karan Kalyani', designation: 'Executive Director', mobileNumber: '+91 9823098765', email: 'k.kalyani@bharatforge.com' },
        departmentContacts: {
          purchase: [{ name: 'Ganesh Kulkarni', designation: 'General Manager - Procurement', mobile: '+91 9823011111', email: 'g.kulkarni@bharatforge.com' }],
          accounts: [{ name: 'Mahesh Jadhav', designation: 'General Manager - Finance', mobile: '+91 9823022222', email: 'm.jadhav@bharatforge.com' }],
          production: [{ name: 'Suresh Patil', designation: 'Plant 4 Production Head', mobile: '+91 9823033333', email: 's.patil@bharatforge.com' }],
          maintenance: [{ name: 'Ashok Varma', designation: 'Chief Electrical Engineer', mobile: '+91 9823044444', email: 'a.varma@bharatforge.com' }]
        },
        financialInfo: { panNumber: 'AAACB5544E', gstNumber: '27AAACB5544E1Z9', msmeNumber: 'UDYAM-MH-12-0077665', msmeCategory: 'very large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Bharat_Forge.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Bharat_Forge.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Bharat_Forge.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'Bank of Baroda', accountNumber: '08760200001122', ifscCode: 'BARB0MUNDHW', accountType: 'Current', bankAddress: 'Mundhwa Main Branch, Pune, MH' },
        productionSections: [
          { sectionName: 'Heavy Press & Forging Shop', location: 'Plant 4 Mundhwa', installedProducts: [{ productId: 'LASER-01', productName: 'High Speed Fiber Laser Printer LM500', modelNumber: 'LM500-MILK-LASER', machineSerialNo: 'SN-LM500-L02' }] }
        ]
      },
      {
        customerCode: 'CUST-10006',
        customerName: 'Cipla Pharmaceuticals Manufacturing Unit',
        industry: 'Pharmaceuticals & Bio-Tech',
        creditPeriod: 45,
        email: 'corporate@cipla.com',
        phone: '+91 22 24826000',
        customerSince: new Date('2021-09-12'),
        remarks: 'GMP Certified sterile liquid vial and tablet packaging line equipped with batch coding lasers.',
        contactPerson: 'Dr. Alok Varma',
        mobile: '+91 9821144332',
        address: 'Kurkumbh MIDC Industrial Zone, Daund, Pune, Maharashtra 413802',
        latitude: 18.3582,
        longitude: 74.5262,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Plot D-27, Kurkumbh MIDC', addressLine2: 'Solapur Highway', city: 'Pune', district: 'Pune', state: 'Maharashtra', country: 'India', pincode: '413802' },
        primaryContact: { contactPerson: 'Dr. Alok Varma', designation: 'Head QA & Compliance', mobileNumber: '+91 9821144332', email: 'alok.v@cipla.com' },
        departmentContacts: {
          purchase: [{ name: 'Nikhil Mehta', designation: 'Pharma Purchase Manager', mobile: '+91 9821155555', email: 'n.mehta@cipla.com' }],
          accounts: [{ name: 'Pooja Shah', designation: 'Accounts Lead', mobile: '+91 9821166666', email: 'p.shah@cipla.com' }],
          production: [{ name: 'Dr. Nilesh Paranjpe', designation: 'Packaging Line Manager', mobile: '+91 9821177777', email: 'n.paranjpe@cipla.com' }],
          maintenance: [{ name: 'Tushar Shinde', designation: 'Sterile Area Engineer', mobile: '+91 9821188888', email: 't.shinde@cipla.com' }]
        },
        financialInfo: { panNumber: 'AAACC1122F', gstNumber: '27AAACC1122F1Z8', msmeNumber: 'UDYAM-MH-12-0033441', msmeCategory: 'large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Cipla_Pharma.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Cipla_Pharma.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Cipla_Pharma.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'Kotak Mahindra Bank', accountNumber: '651122334455', ifscCode: 'KKBK0000951', accountType: 'Current', bankAddress: 'BKC Branch, Mumbai, MH' },
        productionSections: [
          { sectionName: 'Sterile Vial Packaging Line', location: 'Cleanroom Block B', installedProducts: [{ productId: 'TTO-01', productName: 'Thermal Transfer Overprinter TTO-500', modelNumber: 'TTO-500-FOIL-CODER', machineSerialNo: 'SN-TTO500-F01' }] }
        ]
      },
      {
        customerCode: 'CUST-10007',
        customerName: 'Reliance Consumer Goods & Bottling Corp',
        industry: 'Fast Moving Consumer Goods (FMCG)',
        creditPeriod: 30,
        email: 'contact@relconsumer.com',
        phone: '+91 22 35555000',
        customerSince: new Date('2022-04-18'),
        remarks: 'Ultra high-speed carbonated beverage bottling and pouch coding line.',
        contactPerson: 'Sandeep Roy',
        mobile: '+91 9830011223',
        address: 'GIDC Industrial Estate, Hazira, Surat, Gujarat 394270',
        latitude: 21.1175,
        longitude: 72.6372,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'GIDC Industrial Complex', addressLine2: 'Hazira Road', city: 'Surat', district: 'Surat', state: 'Gujarat', country: 'India', pincode: '394270' },
        primaryContact: { contactPerson: 'Sandeep Roy', designation: 'Plant Head - Beverage Division', mobileNumber: '+91 9830011223', email: 'sandeep.roy@relconsumer.com' },
        departmentContacts: {
          purchase: [{ name: 'Hitesh Patel', designation: 'Beverage Packaging Purchaser', mobile: '+91 9830022222', email: 'hitesh@relconsumer.com' }],
          accounts: [{ name: 'Bhavin Shah', designation: 'Plant Finance Lead', mobile: '+91 9830033333', email: 'bhavin@relconsumer.com' }],
          production: [{ name: 'Rajesh Solanki', designation: 'Bottling Line Superintendent', mobile: '+91 9830044444', email: 'rajesh@relconsumer.com' }],
          maintenance: [{ name: 'Dharmesh Joshi', designation: 'Automation Maintenance Lead', mobile: '+91 9830055555', email: 'dharmesh@relconsumer.com' }]
        },
        financialInfo: { panNumber: 'AAACR9988G', gstNumber: '24AAACR9988G1Z7', msmeNumber: 'UDYAM-GJ-06-0044551', msmeCategory: 'very large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Reliance_FMCG.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Reliance_FMCG.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Reliance_FMCG.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'Standard Chartered Bank', accountNumber: '22005544331', ifscCode: 'SCBL0036001', accountType: 'Current', bankAddress: 'Hazira GIDC Branch, Surat, GJ' },
        productionSections: [
          { sectionName: 'PET Bottle Date Jetting Cell', location: 'Bottling Hall 1', installedProducts: [{ productId: 'INK-01', productName: 'Continuous Inkjet Date & Batch Printer IP800', modelNumber: 'IP800-INKJET-CLR', machineSerialNo: 'SN-IP800-I02' }] }
        ]
      },
      {
        customerCode: 'CUST-10008',
        customerName: 'Mahindra Agri Tech & Farm Implements',
        industry: 'Agricultural Machinery',
        creditPeriod: 60,
        email: 'agri@mahindra.com',
        phone: '+91 20 66483300',
        customerSince: new Date('2020-02-14'),
        remarks: 'Tractor transmission and hydraulic assembly line equipped with barcode tracking.',
        contactPerson: 'Nitin Deshpande',
        mobile: '+91 9922055667',
        address: 'Zaheerabad Industrial Area, Sangareddy, Telangana 502220',
        latitude: 17.6791,
        longitude: 77.6067,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Zaheerabad Industrial Layout', addressLine2: 'NH 65 Highway', city: 'Sangareddy', district: 'Sangareddy', state: 'Telangana', country: 'India', pincode: '502220' },
        primaryContact: { contactPerson: 'Nitin Deshpande', designation: 'Operations Manager', mobileNumber: '+91 9922055667', email: 'n.deshpande@mahindra.com' },
        departmentContacts: {
          purchase: [{ name: 'Venkata Reddy', designation: 'Components Sourcing Manager', mobile: '+91 9922011111', email: 'v.reddy@mahindra.com' }],
          accounts: [{ name: 'Srinivas Goud', designation: 'Accounts Lead', mobile: '+91 9922022222', email: 's.goud@mahindra.com' }],
          production: [{ name: 'Mahesh Rao', designation: 'Tractor Assembly Head', mobile: '+91 9922033333', email: 'm.rao@mahindra.com' }],
          maintenance: [{ name: 'Ravi Teja', designation: 'Electrical Engineer', mobile: '+91 9922044444', email: 'r.teja@mahindra.com' }]
        },
        financialInfo: { panNumber: 'AAACM4433H', gstNumber: '36AAACM4433H1Z6', msmeNumber: 'UDYAM-TS-08-0011998', msmeCategory: 'big' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Mahindra_Agri.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Mahindra_Agri.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Mahindra_Agri.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'State Bank of India', accountNumber: '300400500600', ifscCode: 'SBIN0020120', accountType: 'Current', bankAddress: 'Zaheerabad Branch, TS' },
        productionSections: [
          { sectionName: 'Tractor Engine Assembly Line', location: 'Block A Main Bay', installedProducts: [{ productId: 'SCAN-02', productName: 'Industrial Handheld Barcode Scanner', modelNumber: 'ScanMax-Wireless-BT', machineSerialNo: 'SN-SCMAX-BT01' }] }
        ]
      },
      {
        customerCode: 'CUST-10009',
        customerName: 'Schneider Electric Industrial Switchgear',
        industry: 'Electrical & Electronics',
        creditPeriod: 45,
        email: 'info@se.com',
        phone: '+91 80 41390000',
        customerSince: new Date('2021-12-01'),
        remarks: 'Automated circuit breaker laser engraving and test verification cell.',
        contactPerson: 'Meenakshi Iyer',
        mobile: '+91 9845011998',
        address: 'Attibele Industrial Area, Hosur Road, Bengaluru, Karnataka 562107',
        latitude: 12.7783,
        longitude: 77.7712,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Attibele Industrial Zone', addressLine2: 'Hosur Main Road', city: 'Bengaluru', district: 'Bengaluru Rural', state: 'Karnataka', country: 'India', pincode: '562107' },
        primaryContact: { contactPerson: 'Meenakshi Iyer', designation: 'Plant Lead - Quality', mobileNumber: '+91 9845011998', email: 'm.iyer@se.com' },
        departmentContacts: {
          purchase: [{ name: 'Karthik Raja', designation: 'Component Sourcing Lead', mobile: '+91 9845022222', email: 'k.raja@se.com' }],
          accounts: [{ name: 'Vidya Sundaram', designation: 'Plant Accountant', mobile: '+91 9845033333', email: 'v.sundaram@se.com' }],
          production: [{ name: 'Arun Prasad', designation: 'Electronics Line Manager', mobile: '+91 9845044444', email: 'a.prasad@se.com' }],
          maintenance: [{ name: 'Ganesh Moorthy', designation: 'Laser Cell Maintenance Engineer', mobile: '+91 9845055555', email: 'g.moorthy@se.com' }]
        },
        financialInfo: { panNumber: 'AAACS6677I', gstNumber: '29AAACS6677I1Z5', msmeNumber: 'UDYAM-KA-02-0099441', msmeCategory: 'large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Schneider_Electric.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_Schneider_Electric.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_Schneider_Electric.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'Citibank N.A.', accountNumber: '5400991122', ifscCode: 'CITI0000004', accountType: 'Current', bankAddress: 'MG Road Branch, Bengaluru, KA' },
        productionSections: [
          { sectionName: 'MCB Laser Marking & Test Cell', location: 'Electronics Bay 2', installedProducts: [{ productId: 'LASER-02', productName: 'High Speed Fiber Laser Printer LM500', modelNumber: 'LM500-CO2-COMPACT', machineSerialNo: 'SN-LM500-C01' }] }
        ]
      },
      {
        customerCode: 'CUST-10010',
        customerName: 'UltraTech Cement Heavy Clinker Plant',
        industry: 'Cement & Heavy Building Materials',
        creditPeriod: 60,
        email: 'ultratech@adityabirla.com',
        phone: '+91 22 66917800',
        customerSince: new Date('2018-08-20'),
        remarks: 'Automated cement bag bagging, thermal barcode printing and palletizer cell.',
        contactPerson: 'Ramesh Agarwal',
        mobile: '+91 9820066778',
        address: 'Rajashree Nagar, Malkhed Road, Kalaburagi, Karnataka 585211',
        latitude: 17.1812,
        longitude: 77.0215,
        createdBy: adminUser._id,
        registeredOffice: { addressLine1: 'Rajashree Nagar Plant Complex', addressLine2: 'Malkhed Road', city: 'Kalaburagi', district: 'Kalaburagi', state: 'Karnataka', country: 'India', pincode: '585211' },
        primaryContact: { contactPerson: 'Ramesh Agarwal', designation: 'VP Maintenance', mobileNumber: '+91 9820066778', email: 'r.agarwal@adityabirla.com' },
        departmentContacts: {
          purchase: [{ name: 'Sanjay Jain', designation: 'Heavy Material Purchaser', mobile: '+91 9820011111', email: 's.jain@adityabirla.com' }],
          accounts: [{ name: 'Deepak Sharma', designation: 'Accounts Lead', mobile: '+91 9820022222', email: 'd.sharma@adityabirla.com' }],
          production: [{ name: 'Vijay Rathod', designation: 'Clinker Production Manager', mobile: '+91 9820033333', email: 'v.rathod@adityabirla.com' }],
          maintenance: [{ name: 'Manoj Kumar', designation: 'Plant Electrical Lead', mobile: '+91 9820044444', email: 'm.kumar@adityabirla.com' }]
        },
        financialInfo: { panNumber: 'AAACU3322J', gstNumber: '29AAACU3322J1Z4', msmeNumber: 'UDYAM-KA-11-0022334', msmeCategory: 'very large' },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_UltraTech.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf', issueDate: new Date('2017-07-01'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'PAN Card', docName: 'PAN_UltraTech.png', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png', issueDate: new Date('2018-04-12'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' },
          { docType: 'MSME Document', docName: 'MSME_UltraTech.pdf', fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf', issueDate: new Date('2020-09-10'), uploadedBy: 'Admin User', uploadedOn: new Date('2024-01-10'), version: '1.0' }
        ],
        bankDetails: { bankName: 'State Bank of India', accountNumber: '110022334455', ifscCode: 'SBIN0005432', accountType: 'Current', bankAddress: 'Kalaburagi Main Branch, KA' },
        productionSections: [
          { sectionName: 'Automated Cement Bagging Cell', location: 'Silo Bay 3', installedProducts: [{ productId: 'TTO-02', productName: 'Thermal Transfer Overprinter TTO-500', modelNumber: 'TTO-500-PACKAGING', machineSerialNo: 'SN-TTO500-P01' }] }
        ]
      }
    ];

    const testCustomersWithCompany = testCustomers.map(c => ({ companyId, company: companyId, ...c }));
    const createdCustomers = await safeDbCall(() => Customer.insertMany(testCustomersWithCompany), 'Insert Customers');
    console.log(`Created ${createdCustomers.length} Customers.`);

    // 6.6 Seed Customer Visits
    console.log('Seeding Customer Visits...');
    const testVisits = [];
    const targetEmp = employees.find(e => e.name === 'Adesh Bhongale') || employees[0];
    const today = new Date();

    const offsetDate = (days) => {
      const d = new Date(today);
      d.setDate(today.getDate() + days);
      return d;
    };

    const employeesList = [targetEmp, ...employees.slice(0, 4)];

    // 1. Completed Visits (with full GPS check-in/out and selfies)
    const completedData = [
      { cust: createdCustomers[0], emp: employeesList[0], days: 0, schedTime: '10:00', startOffset: 0.1, endOffset: 2.1, startRemark: 'Visit started', endRemark: 'Employee has added customer visit' },
      { cust: createdCustomers[1], emp: employeesList[1], days: 0, schedTime: '11:30', startOffset: 0.2, endOffset: 1.5, startRemark: 'Visit started', endRemark: 'Employee has added customer visit' },
      { cust: createdCustomers[2], emp: employeesList[2], days: -1, schedTime: '14:00', startOffset: 0.05, endOffset: 0.8, startRemark: 'Start check in', endRemark: 'Completed' },
      { cust: createdCustomers[3], emp: employeesList[0], days: -1, schedTime: '15:30', startOffset: 0.15, endOffset: 1.2, startRemark: 'Routine check', endRemark: 'Completed' },
      { cust: createdCustomers[4], emp: employeesList[3], days: -3, schedTime: '09:30', startOffset: 0.1, endOffset: 1.9, startRemark: 'Visit started', endRemark: 'Completed' },
      { cust: createdCustomers[5], emp: employeesList[4], days: -3, schedTime: '16:00', startOffset: 0.25, endOffset: 2.5, startRemark: 'Check-in', endRemark: 'Completed' },
      { cust: createdCustomers[0], emp: employeesList[1], days: -4, schedTime: '10:30', startOffset: 0.05, endOffset: 1.5, startRemark: 'Visit started', endRemark: 'Completed' },
      { cust: createdCustomers[2], emp: employeesList[3], days: -4, schedTime: '13:00', startOffset: 0.1, endOffset: 1.8, startRemark: 'Meeting started', endRemark: 'Completed' },
      { cust: createdCustomers[1], emp: employeesList[2], days: -5, schedTime: '09:00', startOffset: 0.15, endOffset: 2.0, startRemark: 'Onsite review', endRemark: 'Completed successfully' },
      { cust: createdCustomers[3], emp: employeesList[4], days: -5, schedTime: '15:00', startOffset: 0.2, endOffset: 1.2, startRemark: 'Support call start', endRemark: 'Resolved client issues' },
      { cust: createdCustomers[5], emp: employeesList[0], days: -6, schedTime: '11:00', startOffset: 0.08, endOffset: 1.7, startRemark: 'Visit started', endRemark: 'Review done' },
      { cust: createdCustomers[4], emp: employeesList[1], days: -6, schedTime: '14:30', startOffset: 0.12, endOffset: 2.2, startRemark: 'Visit started', endRemark: 'Completed' },
      { cust: createdCustomers[0], emp: employeesList[2], days: -7, schedTime: '10:00', startOffset: 0.05, endOffset: 1.1, startRemark: 'Routine check-in', endRemark: 'All okay' },
      { cust: createdCustomers[2], emp: employeesList[0], days: -7, schedTime: '16:30', startOffset: 0.15, endOffset: 1.5, startRemark: 'Started visit', endRemark: 'Completed visit' }
    ];

    completedData.forEach((item, idx) => {
      const schedDate = offsetDate(item.days);
      schedDate.setHours(parseInt(item.schedTime.split(':')[0]), parseInt(item.schedTime.split(':')[1]), 0, 0);

      const startTime = new Date(schedDate.getTime() + item.startOffset * 60 * 60 * 1000);
      const endTime = new Date(schedDate.getTime() + item.endOffset * 60 * 60 * 1000);

      // Random deviation within 100 meters
      const devStartLat = item.cust.latitude + (Math.random() - 0.5) * 0.0008;
      const devStartLng = item.cust.longitude + (Math.random() - 0.5) * 0.0008;
      const devEndLat = item.cust.latitude + (Math.random() - 0.5) * 0.0008;
      const devEndLng = item.cust.longitude + (Math.random() - 0.5) * 0.0008;

      const isSelf = idx % 3 === 0;

      testVisits.push({
        companyId,
        company: companyId,
        visitType: isSelf ? 'self' : 'customer',
        customerId: isSelf ? undefined : item.cust._id,
        customerName: isSelf ? `Self Location ${idx}` : item.cust.customerName,
        employeeId: item.emp._id,
        employeeName: item.emp.name,
        scheduledDate: schedDate,
        scheduledTime: item.schedTime,
        status: 'Completed',
        startTime: startTime,
        endTime: endTime,
        startLatitude: devStartLat,
        startLongitude: devStartLng,
        endLatitude: devEndLat,
        endLongitude: devEndLng,
        startAddress: item.cust.address,
        endAddress: item.cust.address,
        startLocation: item.cust.address,
        endLocation: item.cust.address,
        startSelfie: `https://i.pravatar.cc/150?u=visit_in_${idx}`,
        endSelfie: `https://i.pravatar.cc/150?u=visit_out_${idx}`,
        reason: 'Scheduled routine follow-up',
        startReason: item.startRemark || 'Visit started',
        completeReason: item.endRemark || 'Completed successfully',
        createdBy: adminUser._id
      });
    });

    // 2. Over Due Visits (scheduled in the past, never checked in/out)
    const overdueData = [
      { cust: createdCustomers[1], emp: employeesList[0], days: -4, schedTime: '14:30' },
      { cust: createdCustomers[2], emp: employeesList[1], days: -5, schedTime: '10:00' },
      { cust: createdCustomers[3], emp: employeesList[2], days: -6, schedTime: '16:00' },
      { cust: createdCustomers[4], emp: employeesList[3], days: -7, schedTime: '11:00' },
      { cust: createdCustomers[5], emp: employeesList[4], days: -8, schedTime: '15:30' },
      { cust: createdCustomers[0], emp: employeesList[1], days: -9, schedTime: '12:00' },
      { cust: createdCustomers[1], emp: employeesList[0], days: -10, schedTime: '14:00' }
    ];

    overdueData.forEach((item, idx) => {
      const schedDate = offsetDate(item.days);
      schedDate.setHours(parseInt(item.schedTime.split(':')[0]), parseInt(item.schedTime.split(':')[1]), 0, 0);

      const isSelf = idx % 3 === 0;

      testVisits.push({
        companyId,
        company: companyId,
        visitType: isSelf ? 'self' : 'customer',
        customerId: isSelf ? undefined : item.cust._id,
        customerName: isSelf ? `Self Overdue Location ${idx}` : item.cust.customerName,
        employeeId: item.emp._id,
        employeeName: item.emp.name,
        scheduledDate: schedDate,
        scheduledTime: item.schedTime,
        status: 'Over Due',
        reason: 'Scheduled meeting',
        startReason: 'Missed visit start',
        completeReason: 'Missed visit completion',
        createdBy: adminUser._id
      });
    });

    // 3. To Do Visits (scheduled today, not started)
    const todoData = [
      { cust: createdCustomers[2], emp: employeesList[0], schedTime: '11:00' },
      { cust: createdCustomers[4], emp: employeesList[1], schedTime: '13:00' },
      { cust: createdCustomers[0], emp: employeesList[2], schedTime: '15:00' },
      { cust: createdCustomers[3], emp: employeesList[3], schedTime: '10:00' },
      { cust: createdCustomers[5], emp: employeesList[4], schedTime: '16:30' }
    ];

    todoData.forEach((item, idx) => {
      const schedDate = new Date();
      schedDate.setHours(parseInt(item.schedTime.split(':')[0]), parseInt(item.schedTime.split(':')[1]), 0, 0);

      const isSelf = idx % 3 === 0;

      testVisits.push({
        companyId,
        company: companyId,
        visitType: isSelf ? 'self' : 'customer',
        customerId: isSelf ? undefined : item.cust._id,
        customerName: isSelf ? `Self Todo Location ${idx}` : item.cust.customerName,
        employeeId: item.emp._id,
        employeeName: item.emp.name,
        scheduledDate: schedDate,
        scheduledTime: item.schedTime,
        status: 'To Do',
        reason: 'Scheduled for today',
        startReason: 'Not started yet',
        completeReason: 'Not completed yet',
        createdBy: adminUser._id
      });
    });

    // 4. In Progress Visits (scheduled today, check-in started)
    const inProgressData = [
      { cust: createdCustomers[3], emp: employeesList[0], schedTime: '12:00', checkInMin: 5 },
      { cust: createdCustomers[1], emp: employeesList[3], schedTime: '14:00', checkInMin: 10 },
      { cust: createdCustomers[2], emp: employeesList[1], schedTime: '15:30', checkInMin: 8 }
    ];

    inProgressData.forEach((item, idx) => {
      const schedDate = new Date();
      schedDate.setHours(parseInt(item.schedTime.split(':')[0]), parseInt(item.schedTime.split(':')[1]), 0, 0);

      const startTime = new Date(schedDate.getTime() + item.checkInMin * 60 * 1000);
      const devStartLat = item.cust.latitude + (Math.random() - 0.5) * 0.0005;
      const devStartLng = item.cust.longitude + (Math.random() - 0.5) * 0.0005;

      const isSelf = idx % 2 === 0;

      testVisits.push({
        companyId,
        company: companyId,
        visitType: isSelf ? 'self' : 'customer',
        customerId: isSelf ? undefined : item.cust._id,
        customerName: isSelf ? `Self Active Location ${idx}` : item.cust.customerName,
        employeeId: item.emp._id,
        employeeName: item.emp.name,
        scheduledDate: schedDate,
        scheduledTime: item.schedTime,
        status: 'In Progress',
        startTime: startTime,
        startLatitude: devStartLat,
        startLongitude: devStartLng,
        startAddress: item.cust.address,
        startLocation: item.cust.address,
        startSelfie: `https://i.pravatar.cc/150?u=visit_prog_${idx}`,
        reason: 'Visit started and active',
        startReason: 'Started on-site visit',
        completeReason: 'Ongoing',
        createdBy: adminUser._id
      });
    });

    // 5. Upcoming Visits (scheduled in the future)
    const upcomingData = [
      { cust: createdCustomers[4], emp: employeesList[0], days: 3, schedTime: '10:00' },
      { cust: createdCustomers[5], emp: employeesList[2], days: 5, schedTime: '15:00' },
      { cust: createdCustomers[0], emp: employeesList[1], days: 2, schedTime: '11:30' },
      { cust: createdCustomers[2], emp: employeesList[3], days: 4, schedTime: '14:00' },
      { cust: createdCustomers[3], emp: employeesList[4], days: 6, schedTime: '09:00' },
      { cust: createdCustomers[1], emp: employeesList[0], days: 7, schedTime: '16:00' }
    ];

    upcomingData.forEach((item, idx) => {
      const schedDate = offsetDate(item.days);
      schedDate.setHours(parseInt(item.schedTime.split(':')[0]), parseInt(item.schedTime.split(':')[1]), 0, 0);

      const isSelf = idx % 3 === 0;

      testVisits.push({
        companyId,
        company: companyId,
        visitType: isSelf ? 'self' : 'customer',
        customerId: isSelf ? undefined : item.cust._id,
        customerName: isSelf ? `Self Upcoming Location ${idx}` : item.cust.customerName,
        employeeId: item.emp._id,
        employeeName: item.emp.name,
        scheduledDate: schedDate,
        scheduledTime: item.schedTime,
        status: 'Upcoming',
        reason: 'Future scheduled check',
        startReason: 'Future visit',
        completeReason: 'Future visit',
        createdBy: adminUser._id
      });
    });

    await safeDbCall(() => CustomerVisit.insertMany(testVisits), 'Insert Customer Visits');
    console.log(`Created ${testVisits.length} Customer Visit records.`);

    console.log(`Successfully seeded:`);
    console.log(`- ${employees.length} Employees`);
    console.log(`- ${attendanceRecords.length} Attendance Records (30 Days)`);
    console.log(`- ${leaveRecords.length} Leave Records`);
    console.log(`- ${createdCustomers.length} Customers`);
    console.log(`- ${testVisits.length} Customer Visits`);

    // 7. Maintenance Phase (from seedEmployees logic)
    console.log('Running maintenance/normalization phase...');
    const allEmployees = await safeDbCall(() => User.find({ role: 'employee' }), 'Find all employees');
    let updatedCount = 0;

    for (let emp of allEmployees) {
      let updated = false;
      if (!emp.department || emp.department === 'NA') {
        emp.department = departmentsData[0]?.name || 'IT';
        updated = true;
      }
      if (!emp.designation || emp.designation === 'NA') {
        emp.designation = designationsData[0]?.name || 'Staff';
        updated = true;
      }
      if (!emp.shift) {
        emp.shift = shifts[0]._id;
        updated = true;
      }
      if (!emp.workingPlace) {
        emp.workingPlace = office._id;
        updated = true;
      }
      if (!emp.gender) {
        emp.gender = 'Male';
        updated = true;
      }
      if (!emp.address) {
        emp.address = 'Flat 402, Royal Palms Apartments, M.G. Road, Pune, Maharashtra 411001';
        updated = true;
      }
      if (!emp.dob) {
        emp.dob = new Date('1995-06-15');
        updated = true;
      }
      if (!emp.bloodGroup) {
        emp.bloodGroup = 'O+';
        updated = true;
      }
      if (!emp.referenceName1) {
        emp.referenceName1 = 'Suresh Sharma';
        emp.referenceNumber1 = '9876543210';
        updated = true;
      }
      if (!emp.referenceName2) {
        emp.referenceName2 = 'Ramesh Patil';
        emp.referenceNumber2 = '9876543211';
        updated = true;
      }
      if (!emp.documents || emp.documents.length === 0) {
        emp.documents = [
          {
            docType: 'Aadhar Card',
            docName: `Aadhar_${emp.name.replace(/\s+/g, '_')}.pdf`,
            fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/aadhar_sample.pdf',
            uploadedOn: new Date('2024-01-15')
          },
          {
            docType: 'PAN Card',
            docName: `PAN_${emp.name.replace(/\s+/g, '_')}.png`,
            fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/pan_sample.png',
            uploadedOn: new Date('2024-01-15')
          }
        ];
        updated = true;
      }
      if (updated) {
        await safeDbCall(() => emp.save(), `Save employee ${emp.name}`);
        updatedCount++;
      }
    }
    console.log(`Normalized ${updatedCount} existing employee records.`);

    // ==========================================
    // 7.5. Seed Master Data Suite
    // ==========================================
    console.log('Seeding Master Data Suite (Customers, Vendors, Products, Materials)...');
    const adminMasterUser = (await safeDbCall(() => User.findOne({ role: 'admin' }), 'Find Admin User')) || employees[0];

    // Customers already seeded in Section 6.5 cleanly

    const vendorsData = [
      {
        vendorName: 'Acme Technologies Pvt Ltd',
        vendorCode: 'VEND-1001',
        companyName: 'Acme International',
        contactPerson: 'Sanjay Gupta',
        mobile: '9870001122',
        email: 'sanjay@acmetech.com',
        gstin: '27AAAAA0000A1Z5',
        paymentTerms: 'Net 30',
        address: 'Industrial Estate Phase 1, Pune, MH',
        notes: 'Hardware Component Supplier',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        vendorName: 'Apex Global Electronics',
        vendorCode: 'VEND-1002',
        companyName: 'Apex Electronics Corp',
        contactPerson: 'Anish Kulkarni',
        mobile: '9822113344',
        email: 'anish@apexelectronics.com',
        gstin: '27BBBBB1111B2Z6',
        paymentTerms: 'Net 15',
        address: 'Electronic City, Bengaluru, KA',
        notes: 'Microcontrollers & Sensors Vendor',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        vendorName: 'Horizon Industrial Supplies',
        vendorCode: 'VEND-1003',
        companyName: 'Horizon Materials Ltd',
        contactPerson: 'Meera Deshmukh',
        mobile: '9944556677',
        email: 'meera@horizonind.com',
        gstin: '27CCCCC2222C3Z7',
        paymentTerms: 'Net 45',
        address: 'MIDC Chakan, Pune, MH',
        notes: 'Raw Materials & Enclosures Supplier',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
    ];
    const vendorsDataWithCompany = vendorsData.map(v => ({ companyId, company: companyId, ...v }));
    await safeDbCall(() => Vendor.insertMany(vendorsDataWithCompany), 'Insert Vendors');
    console.log(`- Seeded ${vendorsData.length} Vendors.`);

    const productsData = [
      {
        name: 'TruCode Smart GPS Tracker Node',
        description: 'IoT-enabled Real-time GPS location tracking terminal for fleet asset management.',
        imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'GPS-Pro 5000',
            description: 'High precision dual-frequency GPS node for heavy machinery',
            installationDate: new Date('2026-01-15'),
            serialNumbers: ['SN-GPS5K-001', 'SN-GPS5K-002', 'SN-GPS5K-003', 'SN-GPS5K-004']
          },
          {
            modelName: 'GPS-Lite 2000',
            description: 'Compact low-power GPS tracker node for light commercial vehicles',
            installationDate: new Date('2026-02-10'),
            serialNumbers: ['SN-GPS2K-101', 'SN-GPS2K-102', 'SN-GPS2K-103']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'TruCode Biometric Terminal X1',
        description: 'Multi-modal Facial Recognition & Fingerprint reader terminal with WiFi & Push Protocol.',
        imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'BioX1-FaceSense',
            description: 'AI Facial recognition terminal with thermal temperature sensor',
            installationDate: new Date('2026-03-01'),
            serialNumbers: ['SN-BIOX1-F881', 'SN-BIOX1-F882', 'SN-BIOX1-F883', 'SN-BIOX1-F884']
          },
          {
            modelName: 'BioX1-TouchPass',
            description: 'Optical fingerprint scanner with anti-spoofing algorithm',
            installationDate: new Date('2026-03-15'),
            serialNumbers: ['SN-BIOX1-T441', 'SN-BIOX1-T442', 'SN-BIOX1-T443']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'RFID Smart Badge Card Reader',
        description: 'High-frequency 13.56MHz RFID card reader terminal for employee access control.',
        imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'RFID-GateControl-100',
            description: 'Wall-mounted turnstile RFID gate access terminal',
            installationDate: new Date('2026-01-20'),
            serialNumbers: ['SN-RFID-G101', 'SN-RFID-G102', 'SN-RFID-G103', 'SN-RFID-G104']
          },
          {
            modelName: 'RFID-DeskScan-50',
            description: 'USB Desktop RFID card encoder and visitor registration terminal',
            installationDate: new Date('2026-02-05'),
            serialNumbers: ['SN-RFID-D501', 'SN-RFID-D502', 'SN-RFID-D503']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'Industrial Handheld Barcode Scanner',
        description: 'Rugged wireless 2D QR & Barcode scanner for warehouse material dispatch.',
        imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'ScanMax-2D-Rugged',
            description: 'IP67 waterproof industrial barcode scanner with Bluetooth 5.0',
            installationDate: new Date('2026-04-05'),
            serialNumbers: ['SN-SCMAX-901', 'SN-SCMAX-902', 'SN-SCMAX-903', 'SN-SCMAX-904']
          },
          {
            modelName: 'ScanMax-Wireless-BT',
            description: 'Long-range wireless barcode scanner with battery dock',
            installationDate: new Date('2026-04-12'),
            serialNumbers: ['SN-SCMAX-BT01', 'SN-SCMAX-BT02', 'SN-SCMAX-BT03']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'High Speed Fiber Laser Printer LM500',
        description: '50W High speed Galvo Fiber Laser coding printer for metal, foil & HDPE pouch marking.',
        imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'LM500-MILK-LASER',
            description: 'Sanitary IP65 fiber laser printer designed for dairy pouch lines',
            installationDate: new Date('2026-01-10'),
            serialNumbers: ['SN-LM500-L01', 'SN-LM500-L02', 'SN-LM500-L03', 'SN-LM500-L04']
          },
          {
            modelName: 'LM500-CO2-COMPACT',
            description: '30W CO2 Laser printer for carton, glass bottle & foil lid coding',
            installationDate: new Date('2026-02-25'),
            serialNumbers: ['SN-LM500-C01', 'SN-LM500-C02', 'SN-LM500-C03']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'Continuous Inkjet Date & Batch Printer IP800',
        description: 'Micro-character continuous inkjet printer for fast MRP, batch code & exp date jetting.',
        imageUrl: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'IP800-INKJET-CLR',
            description: 'Pigmented high-contrast ink jetter for dark plastic containers',
            installationDate: new Date('2026-02-01'),
            serialNumbers: ['SN-IP800-I01', 'SN-IP800-I02', 'SN-IP800-I03', 'SN-IP800-I04']
          },
          {
            modelName: 'IP800-ULTRA-FAST',
            description: 'Triple-line ultra high-speed printer for beverage canning lines',
            installationDate: new Date('2026-03-05'),
            serialNumbers: ['SN-IP800-U01', 'SN-IP800-U02', 'SN-IP800-U03']
          }
        ],
        createdBy: adminMasterUser._id,
      },
      {
        name: 'Thermal Transfer Overprinter TTO-500',
        description: 'Inline Thermal Transfer Overprinter for flexible film, pouch & tray sealing packaging machines.',
        imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=500&auto=format&fit=crop',
        models: [
          {
            modelName: 'TTO-500-FOIL-CODER',
            description: '300 DPI high-res thermal printer for pharma blister foil and pouches',
            installationDate: new Date('2026-01-25'),
            serialNumbers: ['SN-TTO500-F01', 'SN-TTO500-F02', 'SN-TTO500-F03', 'SN-TTO500-F04']
          },
          {
            modelName: 'TTO-500-PACKAGING',
            description: 'Continuous motion thermal overprinter for snack food & bakery bags',
            installationDate: new Date('2026-03-12'),
            serialNumbers: ['SN-TTO500-P01', 'SN-TTO500-P02', 'SN-TTO500-P03']
          }
        ],
        createdBy: adminMasterUser._id,
      }
    ];
    const productsDataWithCompany = productsData.map(p => ({ companyId, company: companyId, ...p }));
    await safeDbCall(() => Product.insertMany(productsDataWithCompany), 'Insert Products');
    console.log(`- Seeded ${productsData.length} Products with models and serial numbers.`);

    const materialsData = [
      {
        name: 'Microcontroller Circuit Board Node',
        code: 'MAT-RAW-001',
        category: 'raw_material',
        uom: 'Units',
        safetyStock: 50,
        imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        name: 'Li-Ion High Capacity Battery Pack 3.7V',
        code: 'MAT-RAW-002',
        category: 'raw_material',
        uom: 'Units',
        safetyStock: 100,
        imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=500&auto=format&fit=crop',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        name: 'Sub-Assembly PCB Board Module',
        code: 'MAT-WIP-001',
        category: 'wip',
        uom: 'Units',
        safetyStock: 25,
        imageUrl: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=500&auto=format&fit=crop',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        name: 'Heavy-Duty ABS Plastic Casing Enclosure',
        code: 'MAT-RAW-003',
        category: 'raw_material',
        uom: 'Units',
        safetyStock: 40,
        imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
      {
        name: 'Finished GPS Tracker Commercial Box',
        code: 'MAT-FG-001',
        category: 'finished_goods',
        uom: 'Boxes',
        safetyStock: 15,
        imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop',
        createdBy: adminMasterUser._id,
        isActive: true,
      },
    ];
    const materialsDataWithCompany = materialsData.map(m => ({ companyId, company: companyId, ...m }));
    await safeDbCall(() => Material.insertMany(materialsDataWithCompany), 'Insert Materials');
    console.log(`- Seeded ${materialsData.length} Materials with images.`);

    // ==========================================
    // 7.6. Interconnect Products, Materials, Vendors, and Customers
    // ==========================================
    console.log('Interconnecting Products, Materials, Vendors, and Customers...');
    const allInsertedVendors = await safeDbCall(() => Vendor.find({}), 'Fetch Vendors');
    const allInsertedProducts = await safeDbCall(() => Product.find({}), 'Fetch Products');
    const allInsertedMaterials = await safeDbCall(() => Material.find({}), 'Fetch Materials');
    const allInsertedCustomers = await safeDbCall(() => Customer.find({}), 'Fetch Customers');

    if (allInsertedVendors.length >= 3 && allInsertedProducts.length >= 7 && allInsertedMaterials.length >= 5) {
      // 1. Update Vendors with Materials Supplied (with delivery period and supply capacity)
      for (let vIdx = 0; vIdx < allInsertedVendors.length; vIdx++) {
        const v = allInsertedVendors[vIdx];
        const mat1 = allInsertedMaterials[vIdx % allInsertedMaterials.length];
        const mat2 = allInsertedMaterials[(vIdx + 1) % allInsertedMaterials.length];

        v.materialsSupplied = [
          { material: mat1._id, materialName: mat1.name, fastestDeliveryPeriod: (vIdx + 2), maxStockSupply: 5000 + (vIdx * 1000) },
          { material: mat2._id, materialName: mat2.name, fastestDeliveryPeriod: (vIdx + 3), maxStockSupply: 8000 + (vIdx * 500) }
        ];
        await v.save();
      }

      // 2. Update Materials with Preferred Vendors
      allInsertedMaterials[0].preferredVendors = [allInsertedVendors[0]._id, allInsertedVendors[1]._id];
      await allInsertedMaterials[0].save();

      allInsertedMaterials[1].preferredVendors = [allInsertedVendors[0]._id];
      await allInsertedMaterials[1].save();

      allInsertedMaterials[2].preferredVendors = [allInsertedVendors[1]._id];
      await allInsertedMaterials[2].save();

      allInsertedMaterials[3].preferredVendors = [allInsertedVendors[2]._id];
      await allInsertedMaterials[3].save();

      allInsertedMaterials[4].preferredVendors = [allInsertedVendors[2]._id];
      await allInsertedMaterials[4].save();

      // 3. Update Customers & Installed Equipment with Product Ref
      for (let cIdx = 0; cIdx < allInsertedCustomers.length; cIdx++) {
        const cust = allInsertedCustomers[cIdx];
        let custUpdated = false;
        if (cust.productionSections && cust.productionSections.length > 0) {
          cust.productionSections.forEach((sec, sIdx) => {
            if (sec.installedProducts && sec.installedProducts.length > 0) {
              sec.installedProducts.forEach((prod, pIdx) => {
                const prodRef = allInsertedProducts[(cIdx + sIdx + pIdx) % allInsertedProducts.length];
                prod.productRef = prodRef._id;
                custUpdated = true;
              });
            }
            if (sec.subSections && sec.subSections.length > 0) {
              sec.subSections.forEach((sub, subIdx) => {
                if (sub.installedProducts && sub.installedProducts.length > 0) {
                  sub.installedProducts.forEach((prod, pIdx) => {
                    const prodRef = allInsertedProducts[(cIdx + subIdx + pIdx) % allInsertedProducts.length];
                    prod.productRef = prodRef._id;
                    custUpdated = true;
                  });
                }
              });
            }
          });
        }
        if (custUpdated) {
          await safeDbCall(() => cust.save(), `Save customer product interconnections for ${cust.customerName}`);
        }
      }
      console.log('✓ Successfully interconnected Products, Materials, Vendors, and Customers in DB.');
    }

    // ==========================================
    // 8. Seed Notification Telemetry
    // ==========================================
    console.log('Seeding push notifications and recipient logs...');

    const seededAdmin = await safeDbCall(() => User.findOne({ role: 'admin' }), 'Find admin') || await safeDbCall(() => User.findOne({ role: 'employee' }), 'Find employee fallback');
    const seededEmployees = await safeDbCall(() => User.find({ role: 'employee' }), 'Find employees');

    if (seededAdmin && seededEmployees.length > 0) {
      console.log('Generating dynamic notifications for all 9 types based on seeded data...');

      const seededLogs = [];
      const seededFeeds = [];

      const allDepts = await safeDbCall(() => Department.find({}), 'Find departments');
      const deptNames = allDepts.map(d => d.name);
      const targetDept = deptNames[0] || 'IT';

      // 9 distinct notification templates matching the backend Notification enum
      const templates = [
        {
          type: 'general notification',
          title: 'Office Relocation Phase Update',
          description: 'Please note that the corporate headquarters relocation project is proceeding. Detailed transition guidelines are available on the intranet.',
          targetType: 'All Employees',
          isAuto: false,
          autoType: 'general'
        },
        {
          type: 'attendance notification',
          title: 'Absent Notification 🔴',
          description: 'You have been marked ABSENT for [FormattedDate]. If this is a mistake, please contact HR.',
          targetType: 'Specific Employees',
          isAuto: true,
          autoType: 'Employee absent'
        },
        {
          type: 'attendance notification',
          title: 'Late Arrival Warning ⏰',
          description: 'You checked in late today for your scheduled shift on [FormattedDate]. Please maintain your shift schedule.',
          targetType: 'Specific Employees',
          isAuto: true,
          autoType: 'Employee late by grace time'
        },
        {
          type: 'general notification',
          title: 'Leave Approved! 🎉',
          description: 'Good news! Your leave request has been reviewed and approved by the management.',
          targetType: 'Specific Employees',
          isAuto: true,
          autoType: 'Leave approved'
        },
        {
          type: 'tracing notification',
          title: 'Geofence Exit Alert 📍',
          description: 'You have exited the designated geofence boundary during shift hours. Please stay inside the tracking zone.',
          targetType: 'Specific Employees',
          isAuto: true,
          autoType: 'Employee outside geofence'
        },
        {
          type: 'general notification',
          title: 'Shift Schedule Updated 🚀',
          description: 'Your work shift schedule has been updated. Please verify your new timing.',
          targetType: 'All Employees',
          isAuto: true,
          autoType: 'Shift change reminder'
        },
        {
          type: 'attendance notification',
          title: 'Punch Out Reminder 🕒',
          description: 'Your shift is ending shortly. Please remember to clock out to record your working hours correctly.',
          targetType: 'All Employees',
          isAuto: true,
          autoType: 'Employee punch out reminder'
        },
        {
          type: 'general notification',
          title: 'Quarterly Townhall Meeting Scheduled',
          description: 'All departments are requested to join the quarterly townhall meeting. We will review department performance and general updates.',
          targetType: 'All Employees',
          isAuto: false,
          autoType: null
        },
        {
          type: 'emergency notification',
          title: 'Emergency Evacuation Drill',
          description: 'Critical Alert: The annual building safety evacuation drill is scheduled for this week. Please follow instructions.',
          targetType: 'All Employees',
          isAuto: false,
          autoType: null
        }
      ];

      for (let i = 0; i < templates.length; i++) {
        const t = templates[i];

        // Generate a date for this notification (e.g. between 1 and 10 days ago)
        const daysAgo = (i % 10) + 1;
        const notifDate = new Date();
        notifDate.setDate(notifDate.getDate() - daysAgo);

        // Format the date beautifully: e.g. "Tuesday, May 19, 2026"
        const formattedDate = notifDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Replace the date placeholder in description if present
        const resolvedDescription = t.description.replace('[FormattedDate]', formattedDate);

        // Resolve targets dynamically based on targetType
        let employeesTarget = [];
        let departmentTarget = [];

        if (t.targetType === 'All Employees') {
          employeesTarget = []; // For 'All Employees', Notification schema stores empty employees array
        } else if (t.targetType === 'Specific Department') {
          departmentTarget = t.departments;
        } else if (t.targetType === 'Specific Employees') {
          // Select 2 random employees
          const randEmp1 = seededEmployees[i % seededEmployees.length];
          const randEmp2 = seededEmployees[(i + 3) % seededEmployees.length];
          employeesTarget = [randEmp1._id, randEmp2._id];
        }

        const notification = await safeDbCall(() => Notification.create({
          companyId,
          company: companyId,
          title: t.title,
          description: resolvedDescription,
          type: t.type,
          frequency: 'Instant',
          targetType: t.targetType,
          employees: employeesTarget,
          departments: departmentTarget,
          status: 'sent',
          createdBy: seededAdmin._id,
          isAuto: t.isAuto,
          autoType: t.autoType,
          createdAt: notifDate,
          updatedAt: notifDate
        }), `Create Notification Template ${t.type}`);

        // Get actual recipient employees to insert logs and feeds
        let recipients = [];
        if (t.targetType === 'All Employees') {
          recipients = seededEmployees;
        } else if (t.targetType === 'Specific Department') {
          recipients = seededEmployees.filter(emp => departmentTarget.includes(emp.department));
        } else if (t.targetType === 'Specific Employees') {
          recipients = seededEmployees.filter(emp => employeesTarget.map(String).includes(String(emp._id)));
        }

        for (const emp of recipients) {
          const isRead = Math.random() > 0.4;
          const readTime = isRead ? new Date(notifDate.getTime() + 15 * 60000) : null;

          seededLogs.push({
            notificationId: notification._id,
            employeeId: emp._id,
            fcmToken: emp.fcmToken || `mock_fcm_token_${emp._id}`,
            sentAt: notifDate,
            deliveredAt: notifDate,
            isRead,
            readTime,
            deliveryStatus: isRead ? 'read' : 'delivered',
            deviceType: Math.random() > 0.5 ? 'Mobile' : 'Web',
            errorMessage: null
          });

          seededFeeds.push({
            employeeId: emp._id,
            notificationId: notification._id,
            title: t.title,
            body: resolvedDescription,
            type: t.type,
            isRead,
            readTime,
            createdAt: notifDate
          });
        }
      }

      if (seededLogs.length > 0) {
        console.log(`Saving ${seededLogs.length} dynamic Notification Logs in batches...`);
        await saveInBatches(NotificationLog, seededLogs, 50);
      }

      if (seededFeeds.length > 0) {
        console.log(`Saving ${seededFeeds.length} dynamic In-App Feeds in batches...`);
        await saveInBatches(EmployeeNotification, seededFeeds, 50);
      }

      console.log(`- Seeded all 9 types of notifications successfully with dynamic logs and feeds!`);
    }

    // Seed 10 Comprehensive Vendors with every single field populated
    console.log('Seeding 10 comprehensive vendor records...');
    const vendorsToSeed = [
      {
        vendorName: 'Apex Industrial Solutions Pvt Ltd',
        vendorCode: 'VEND-10001',
        industry: 'Manufacturing',
        deliveryPeriod: 14,
        description: 'Premier supplier of high-precision CNC machinery and industrial cutting tools.',
        dateOfIncorporation: new Date('2012-04-15'),
        registeredOffice: {
          addressLine1: 'Plot 45, MIDC Industrial Area',
          addressLine2: 'Phase II, Chakan',
          area: 'Chakan',
          city: 'Pune',
          district: 'Pune',
          state: 'Maharashtra',
          country: 'India',
          pincode: '410501'
        },
        primaryContact: {
          contactPerson: 'Rajesh Sharma',
          designation: 'General Manager',
          mobileNumber: '+91 9823011223',
          email: 'rajesh.sharma@apexindustrial.com'
        },
        departmentContacts: {
          purchase: { name: 'Sunil Verma', designation: 'Purchase Head', mobile: '+91 9823011224', email: 'purchase@apexindustrial.com' },
          accounts: { name: 'Priya Kulkarni', designation: 'Accounts Manager', mobile: '+91 9823011225', email: 'accounts@apexindustrial.com' }
        },
        financialInfo: {
          panNumber: 'AAACA1234A',
          gstNumber: '27AAACA1234A1Z5',
          dateOfIncorporation: new Date('2012-04-15'),
          msmeNumber: 'UDYAM-MH-01-0012345',
          msmeCategory: 'small'
        },
        bankDetails: {
          bankName: 'HDFC Bank',
          accountNumber: '50200012345678',
          ifscCode: 'HDFC0000123',
          branchName: 'Chakan Industrial Branch',
          accountType: 'Current',
          bankAddress: 'Chakan Square, Pune'
        },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Apex_2026.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2017-07-01'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Apex.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2012-04-15'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Apex.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2020-01-10'), expiryDate: new Date('2030-12-31') }
        ],
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Apex_2026.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2017-07-01'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Apex.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2012-04-15'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Apex.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2020-01-10'), expiryDate: new Date('2030-12-31') }
        ],
        status: 'Active',
        isActive: true
      },
      {
        vendorName: 'ElectroTech Components & Systems',
        vendorCode: 'VEND-10002',
        industry: 'Electronics',
        deliveryPeriod: 7,
        description: 'Global distributor of microcontrollers, PCB assemblies, and automation sensors.',
        dateOfIncorporation: new Date('2015-08-20'),
        registeredOffice: {
          addressLine1: 'Building B-4, Electronic City',
          addressLine2: 'Sector 5, Mahape',
          area: 'Mahape',
          city: 'Navi Mumbai',
          district: 'Thane',
          state: 'Maharashtra',
          country: 'India',
          pincode: '400710'
        },
        primaryContact: {
          contactPerson: 'Anil Deshmukh',
          designation: 'Technical Director',
          mobileNumber: '+91 9920188334',
          email: 'anil@electrotech.co.in'
        },
        departmentContacts: {
          purchase: { name: 'Karan Mehta', designation: 'Sr. Procurement Lead', mobile: '+91 9920188335', email: 'procurement@electrotech.co.in' },
          accounts: { name: 'Sonal Shah', designation: 'Finance Controller', mobile: '+91 9920188336', email: 'accounts@electrotech.co.in' }
        },
        financialInfo: {
          panNumber: 'BBBEC5678B',
          gstNumber: '27BBBEC5678B1Z9',
          dateOfIncorporation: new Date('2015-08-20'),
          msmeNumber: 'UDYAM-MH-02-0056789',
          msmeCategory: 'mid'
        },
        bankDetails: {
          bankName: 'ICICI Bank',
          accountNumber: '001105009876',
          ifscCode: 'ICIC0000011',
          branchName: 'Vashi Main Branch',
          accountType: 'Current',
          bankAddress: 'Sector 17, Vashi, Navi Mumbai'
        },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Electrotech.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2017-07-01'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Electrotech.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2015-08-20'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Electrotech.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2021-03-15'), expiryDate: new Date('2030-12-31') }
        ],
        status: 'Active',
        isActive: true
      },
      {
        vendorName: 'Titan Tooling & Engineering Works',
        vendorCode: 'VEND-10003',
        industry: 'Engineering',
        deliveryPeriod: 10,
        description: 'Specialists in custom jigs, fixtures, press tools, and mold fabrication.',
        dateOfIncorporation: new Date('2010-02-11'),
        registeredOffice: {
          addressLine1: 'Gat No. 128, Kagal MIDC',
          addressLine2: '5th Lane, Textile Park Road',
          area: 'Kagal',
          city: 'Kolhapur',
          district: 'Kolhapur',
          state: 'Maharashtra',
          country: 'India',
          pincode: '416216'
        },
        primaryContact: {
          contactPerson: 'Vikram Patil',
          designation: 'Managing Partner',
          mobileNumber: '+91 9422045678',
          email: 'vikram@titantooling.in'
        },
        departmentContacts: {
          purchase: { name: 'Sanjay More', designation: 'Purchase Manager', mobile: '+91 9422045679', email: 'purchase@titantooling.in' },
          accounts: { name: 'Rohan Jadhav', designation: 'Chief Accountant', mobile: '+91 9422045680', email: 'accounts@titantooling.in' }
        },
        financialInfo: {
          panNumber: 'CCCTT9988C',
          gstNumber: '27CCCTT9988C1Z2',
          dateOfIncorporation: new Date('2010-02-11'),
          msmeNumber: 'UDYAM-MH-03-0099887',
          msmeCategory: 'small'
        },
        bankDetails: {
          bankName: 'State Bank of India',
          accountNumber: '33445566778',
          ifscCode: 'SBIN0001234',
          branchName: 'Kagal MIDC Branch',
          accountType: 'Current',
          bankAddress: 'MIDC Main Gate, Kagal'
        },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Titan.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2017-07-01'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Titan.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2010-02-11'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Titan.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2019-11-20'), expiryDate: new Date('2030-12-31') }
        ],
        status: 'Active',
        isActive: true
      },
      {
        vendorName: 'Radiant Chemical & Polymers',
        vendorCode: 'VEND-10004',
        industry: 'Chemicals',
        deliveryPeriod: 5,
        description: 'Manufacturer of industrial lubricants, coolant fluids, and polymer resins.',
        dateOfIncorporation: new Date('2014-11-05'),
        registeredOffice: {
          addressLine1: 'Plot A-12, GIDC Industrial Estate',
          addressLine2: 'Ankleshwar Chemical Zone',
          area: 'Ankleshwar',
          city: 'Bharuch',
          district: 'Bharuch',
          state: 'Gujarat',
          country: 'India',
          pincode: '393002'
        },
        primaryContact: {
          contactPerson: 'Mahesh Patel',
          designation: 'Commercial Manager',
          mobileNumber: '+91 9712903344',
          email: 'mahesh@radiantchem.com'
        },
        departmentContacts: {
          purchase: { name: 'Dharmesh Shah', designation: 'Raw Material Buyer', mobile: '+91 9712903345', email: 'purchase@radiantchem.com' },
          accounts: { name: 'Deepak Joshi', designation: 'Accounts Officer', mobile: '+91 9712903346', email: 'accounts@radiantchem.com' }
        },
        financialInfo: {
          panNumber: 'DDDRC4455D',
          gstNumber: '24DDDRC4455D1Z8',
          dateOfIncorporation: new Date('2014-11-05'),
          msmeNumber: 'UDYAM-GJ-04-0044556',
          msmeCategory: 'mid'
        },
        bankDetails: {
          bankName: 'Axis Bank',
          accountNumber: '9140200543210',
          ifscCode: 'UTIB0000456',
          branchName: 'Ankleshwar Station Road',
          accountType: 'Current',
          bankAddress: 'Station Road, Ankleshwar'
        },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Radiant.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2017-07-01'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Radiant.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2014-11-05'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Radiant.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2020-05-12'), expiryDate: new Date('2030-12-31') }
        ],
        status: 'Active',
        isActive: true
      },
      {
        vendorName: 'Zenith Automation & Robotics',
        vendorCode: 'VEND-10005',
        industry: 'Automation',
        deliveryPeriod: 21,
        description: 'Turnkey automation systems, PLC control panels, and robotic arm assembly Integration.',
        dateOfIncorporation: new Date('2018-01-25'),
        registeredOffice: {
          addressLine1: 'Tower C, IT & Hardware Park',
          addressLine2: 'Hitec City Phase II',
          area: 'Hitec City',
          city: 'Hyderabad',
          district: 'Rangareddy',
          state: 'Telangana',
          country: 'India',
          pincode: '500081'
        },
        primaryContact: {
          contactPerson: 'Srinivas Rao',
          designation: 'Chief Technology Officer',
          mobileNumber: '+91 9849012345',
          email: 'srinivas@zenithauto.com'
        },
        departmentContacts: {
          purchase: { name: 'Venkatesh K', designation: 'Supply Chain Head', mobile: '+91 9849012346', email: 'scm@zenithauto.com' },
          accounts: { name: 'Madhavi L', designation: 'Finance Manager', mobile: '+91 9849012347', email: 'finance@zenithauto.com' }
        },
        financialInfo: {
          panNumber: 'EEEZA1122E',
          gstNumber: '36EEEZA1122E1Z1',
          dateOfIncorporation: new Date('2018-01-25'),
          msmeNumber: 'UDYAM-TS-05-0011223',
          msmeCategory: 'big'
        },
        bankDetails: {
          bankName: 'Kotak Mahindra Bank',
          accountNumber: '8811223344',
          ifscCode: 'KKBK0000567',
          branchName: 'Hitec City Branch',
          accountType: 'Current',
          bankAddress: 'Cyber Towers, Hyderabad'
        },
        documents: [
          { docType: 'GST Certificate', docName: 'GST_Zenith.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2018-01-25'), expiryDate: new Date('2030-12-31') },
          { docType: 'PAN Card', docName: 'PAN_Zenith.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2018-01-25'), expiryDate: new Date('2030-12-31') },
          { docType: 'MSME Document', docName: 'MSME_Zenith.pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', issueDate: new Date('2022-02-18'), expiryDate: new Date('2030-12-31') }
        ],
        status: 'Active',
        isActive: true
      }
    ];

    const vendorsToSeedWithCompany = vendorsToSeed.map(v => ({ companyId, company: companyId, ...v }));
    await safeDbCall(() => Vendor.insertMany(vendorsToSeedWithCompany), 'Insert 5 Vendors');
    console.log(`Created ${vendorsToSeed.length} comprehensive Vendors with all fields!`);

    // 11. Material Movement End-to-End Flow Seeding (Transaction & Serialized Barcodes)
    console.log('\n-----------------------------------------------------------');
    console.log('Seeding Material Movement End-to-End Transaction & Barcodes...');
    console.log('-----------------------------------------------------------');

    const allUsers = await safeDbCall(() => User.find({}), 'Fetch users for transaction');
    const allDepts = await safeDbCall(() => Department.find({}), 'Fetch depts for transaction');

    const requester = allUsers.find(e => e.email === 'adesh@example.com') || allUsers[0];
    const mgtApprover = allUsers.find(e => e.name === 'Minal Patil') || allUsers.find(e => e.name === 'Aditya Pise') || allUsers[0];
    const storeUser = allUsers.find(e => e.name === 'Ayush') || allUsers.find(e => e.name === 'Preetam Dige') || allUsers[0];
    const handlerUser = allUsers.find(e => e.name === 'Rahul') || allUsers.find(e => e.name === 'Gaurav') || allUsers[15];
    const deptDoc = allDepts.find(d => d.name && d.name.includes('Software')) || allDepts[0];

    const expDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const txIdNum = Math.floor(100000 + Math.random() * 900000);
    const txnIdStr = `RDC-2026-${txIdNum}`;

    const txn = await safeDbCall(() => Transaction.create({
      companyId,
      company: companyId,
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
      timeline: [{
        action: 'submitted',
        description: 'Draft request created via mobile app',
        user: requester._id,
        timestamp: new Date()
      }]
    }), 'Create Material Movement Transaction');

    console.log(`✓ Material Request Created (TXN ID: ${txn.transactionId})`);

    // Perform Management Approval
    txn.status = 'mgt_approved';
    if (!Array.isArray(txn.approvalChain)) txn.approvalChain = [];
    txn.approvalChain.push({
      user: mgtApprover._id,
      role: 'management',
      action: 'approved',
      timestamp: new Date(),
      remarks: 'Approved by Management Approver'
    });
    if (!Array.isArray(txn.timeline)) txn.timeline = [];
    txn.timeline.push({
      action: 'mgt_approved',
      description: 'Approved by Management Approver',
      user: mgtApprover._id,
      timestamp: new Date()
    });
    await safeDbCall(() => txn.save(), 'Save Management Approval');
    console.log(`✓ Management Approval Completed (Status: ${txn.status})`);

    // Store Dispatch & Barcode Generation
    const createdBarcodes = [];
    let numBcCounter = 291029;

    for (const item of txn.materials) {
      const itemMatName = item.materialName || item.name;
      if (!Array.isArray(item.barcodes)) item.barcodes = [];
      for (let q = 0; q < item.quantity; q++) {
        const bcCode = String(numBcCounter++).padStart(7, '0');
        item.barcodes.push({
          barcode: bcCode,
          status: 'Active'
        });

        const bcDoc = await safeDbCall(() => Barcode.create({
          companyId,
          company: companyId,
          barcode: bcCode,
          materialName: itemMatName,
          transactionId: txn.transactionId,
          transaction: txn._id,
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
        }), 'Create Barcode');
        createdBarcodes.push(bcDoc);
      }
    }

    txn.status = 'dispatched';
    txn.handler = handlerUser._id;
    txn.dispatchedAt = new Date();
    await safeDbCall(() => txn.save(), 'Save Transaction Dispatch');
    console.log(`✓ Store Dispatch Complete! (${createdBarcodes.length} Barcodes Generated)`);

    // Recipient GeoPhoto Verification
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

    for (const b of createdBarcodes) {
      b.status = 'Active';
      b.owner = requester._id;
      b.ownershipHistory.push({
        user: requester._id,
        assignedAt: new Date(),
        action: 'received',
        remarks: 'Material receipt verified via mobile GeoPhoto camera'
      });
      await safeDbCall(() => b.save(), 'Save Barcode Receipt');
    }

    txn.status = 'received';
    txn.receivedAt = new Date();
    txn.receiptPhoto = geoPhotoProof;
    await safeDbCall(() => txn.save(), 'Save Transaction Receipt');
    console.log(`✓ Materials Received & Credited to Inventory! (New Status: ${txn.status})`);

    // Reel Split & Merge Operations
    const targetParent = createdBarcodes[0];
    const splitChildCode = String(numBcCounter++).padStart(7, '0');

    const childBarcode = await safeDbCall(() => Barcode.create({
      companyId,
      company: companyId,
      barcode: splitChildCode,
      parentBarcode: targetParent.barcode,
      materialName: targetParent.materialName,
      transactionId: txn.transactionId,
      transaction: txn._id,
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
    }), 'Create Split Barcode');

    const mergeTargetCode = String(numBcCounter++).padStart(7, '0');
    const barcodesToMerge = [createdBarcodes[1].barcode, createdBarcodes[2].barcode];

    const mergedBarcodeDoc = await safeDbCall(() => Barcode.create({
      companyId,
      company: companyId,
      barcode: mergeTargetCode,
      materialName: `${createdBarcodes[1].materialName} (Merged Reel)`,
      transactionId: txn.transactionId,
      transaction: txn._id,
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
    }), 'Create Merged Barcode');

    await safeDbCall(() => Barcode.updateMany({ barcode: { $in: barcodesToMerge } }, { $set: { status: 'Closed' } }), 'Update Merged Barcodes');
    console.log(`✓ Barcode Reel Split & Merge Operations Completed Cleanly!`);

    // ═══════════════════════════════════════════════════════════════
    // SEED EXPENSE MASTERS & DEMO CLAIMS FOR EMPLOYEES
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- Seeding Expense Masters & Employee Claims ---');
    await safeDbCall(() => ensureExpenseMasters(companyId), 'Ensure Expense Masters');

    // Clean up any demo claims erroneously attached to Preetam Dige
    await safeDbCall(() => ExpenseClaim.deleteMany({
      companyId,
      $or: [
        { submittedByName: 'Preetam Dige' },
        { 'employeeClaims.employee.name': 'Preetam Dige' }
      ]
    }), 'Delete Preetam Dige Claims');

    const policy = await getActivePolicy(companyId);
    if (policy) {
      const types = await getExpenseTypes(companyId);
      const typeCodes = types.map(t => t.code);

      // Find employees strictly EXCLUDING Preetam Dige
      const expenseTargetEmployees = await safeDbCall(() => User.find({
        companyId,
        name: { $ne: 'Preetam Dige' },
        email: { $ne: 'Preetam.vp@example.com' }
      }).populate('levelRef').populate('gradeRef').limit(20), 'Find Target Employees for Expenses');

      if (expenseTargetEmployees && expenseTargetEmployees.length > 0) {
        const adeshUser = insertedUserMap['Adesh Bhongale'] || expenseTargetEmployees.find(u => u.email === 'adesh@example.com') || expenseTargetEmployees.find(u => /adesh/i.test(u.name));
        const imranUser = expenseTargetEmployees.find(u => u.name === 'Imran Shaikh') || expenseTargetEmployees[0];
        const prathmeshUser = expenseTargetEmployees.find(u => u.name === 'Prathmesh Joshi') || expenseTargetEmployees[1 % expenseTargetEmployees.length];
        const sanketUser = expenseTargetEmployees.find(u => u.name === 'Sanket Kharade') || expenseTargetEmployees[2 % expenseTargetEmployees.length];
        const ayushUser = expenseTargetEmployees.find(u => u.name === 'Ayush Patil') || expenseTargetEmployees[3 % expenseTargetEmployees.length];
        const suryakantUser = expenseTargetEmployees.find(u => u.name === 'Suryakant Kore') || expenseTargetEmployees[4 % expenseTargetEmployees.length];

        const SEEDED_EXPENSE_PLANS = [
          // ─── Adesh Bhongale (adesh@example.com) Claims ───
          ...(adeshUser ? [
            {
              user: adeshUser,
              type: 'LODGING',
              purpose: 'Client ERP System Deployment & Onboarding',
              destination: 'PUNE',
              travelMode: 'TRAIN',
              startDate: '2026-08-08',
              endDate: '2026-08-10',
              items: [
                { expenseType: 'LODGING', customerName: 'Acme Manufacturing', amount: 2500, requestedAmount: 2500, days: 2 },
                { expenseType: 'FOOD', customerName: 'Acme Manufacturing', amount: 800, requestedAmount: 800 },
              ],
              status: 'SETTLED',
              paymentStatus: 'PAID',
              paidAmount: 3300,
              paymentMethod: 'Bank Transfer (NEFT)',
              utr: 'HDFC1122334455',
              accountsRemarks: 'Reimbursed in full against hotel invoice',
            },
            {
              user: adeshUser,
              type: 'CONVEYANCE',
              purpose: 'Local Client Office Visits & User Training',
              destination: 'PUNE',
              travelMode: 'OWN_VEHICLE',
              startDate: '2026-08-12',
              endDate: '2026-08-12',
              items: [
                { expenseType: 'CONVEYANCE', vehicle: 'twoWheeler', distanceKm: 45, requestedAmount: 157.5, amount: 157.5 },
              ],
              status: 'SUBMITTED',
            },
            {
              user: adeshUser,
              type: 'OTHER',
              purpose: 'Technical Training Workshop Stationery & Supplies',
              destination: 'PUNE',
              travelMode: '',
              startDate: '2026-08-14',
              endDate: '2026-08-14',
              items: [
                { expenseType: 'OTHER', description: 'Whiteboard markers and project notebooks', amount: 650, requestedAmount: 650 },
              ],
              status: 'ACCOUNTS_PENDING',
            },
            {
              user: adeshUser,
              type: 'TRAVEL',
              purpose: 'Software Architecture Conference',
              destination: 'MUMBAI',
              travelMode: 'TRAIN',
              startDate: '2026-08-16',
              endDate: '2026-08-17',
              items: [
                { expenseType: 'TRAVEL', customerName: 'Tech Conference 2026', amount: 1200, requestedAmount: 1200 },
                { expenseType: 'FOOD', customerName: 'Tech Conference 2026', amount: 450, requestedAmount: 450 },
              ],
              status: 'DRAFT',
            },
          ] : []),

          // ─── Other Employees Claims ───
          // Imran Shaikh (Projects & Engineering) - Settled Site Visit
          {
            user: imranUser,
            type: 'LODGING',
            purpose: 'Site Project Installation & Commissioning',
            destination: 'MUMBAI',
            travelMode: 'TRAIN',
            startDate: '2026-08-04',
            endDate: '2026-08-06',
            items: [
              { expenseType: 'LODGING', customerName: 'Bharat Infrastructure', amount: 3200, requestedAmount: 3200, days: 2 },
              { expenseType: 'FOOD', customerName: 'Bharat Infrastructure', amount: 1000, requestedAmount: 1000 },
            ],
            status: 'SETTLED',
            paymentStatus: 'PAID',
            paidAmount: 4200,
            paymentMethod: 'Bank Transfer (NEFT)',
            utr: 'HDFC9911223344',
            accountsRemarks: 'Audited and disbursed in full',
          },
          // Prathmesh Joshi (Software & Systems) - Waiting for Disbursement
          {
            user: prathmeshUser,
            type: 'TRAVEL',
            purpose: 'Enterprise Cloud Architecture Summit & Client Demo',
            destination: 'BENGALURU',
            travelMode: 'FLIGHT',
            startDate: '2026-08-11',
            endDate: '2026-08-13',
            items: [
              { expenseType: 'TRAVEL', customerName: 'Cloud Summit 2026', amount: 5500, requestedAmount: 5500 },
              { expenseType: 'LODGING', customerName: 'Cloud Summit 2026', amount: 3000, requestedAmount: 3000, days: 2 },
            ],
            status: 'ACCOUNTS_PENDING',
          },
          // Sanket Kharade (Electronics) - Waiting for Approval
          {
            user: sanketUser,
            type: 'CONVEYANCE',
            purpose: 'Client Hardware Testing & Sensor Deployment',
            destination: 'HYDERABAD',
            travelMode: 'OWN_VEHICLE',
            startDate: '2026-08-15',
            endDate: '2026-08-15',
            items: [
              { expenseType: 'CONVEYANCE', vehicle: 'car', distanceKm: 120, requestedAmount: 1800, amount: 1800 },
              { expenseType: 'FOOD', customerName: 'Apex Sensor Labs', amount: 1350, requestedAmount: 1350 },
            ],
            status: 'SUBMITTED',
          },
          // Ayush Patil (Stores & Dispatch) - Rejected Claim
          {
            user: ayushUser,
            type: 'OTHER',
            purpose: 'Urgent Local Warehouse Transport & Packing Supplies',
            destination: 'PUNE',
            travelMode: '',
            startDate: '2026-08-16',
            endDate: '2026-08-16',
            items: [
              { expenseType: 'OTHER', description: 'Emergency packing cartons & delivery', amount: 1850, requestedAmount: 1850 },
            ],
            status: 'REJECTED',
          },
          // Suryakant Kore (Projects & Engineering) - Draft Claim
          {
            user: suryakantUser,
            type: 'CONVEYANCE',
            purpose: 'Field Sensor Calibration Visit',
            destination: 'PUNE',
            travelMode: 'OWN_VEHICLE',
            startDate: '2026-08-17',
            endDate: '2026-08-17',
            items: [
              { expenseType: 'CONVEYANCE', vehicle: 'twoWheeler', distanceKm: 35, requestedAmount: 122.5, amount: 122.5 },
            ],
            status: 'DRAFT',
          },
        ];

        for (const plan of SEEDED_EXPENSE_PLANS) {
          const emp = plan.user;
          if (!emp) continue;

          const empLevelNumber = getEmployeeLevelNumber(emp);
          const empGradeCode = getEmployeeGradeCode(emp);
          const destinationClass = await resolveCityClass(companyId, plan.destination);
          const entitlements = await getEntitlements(companyId, policy._id, typeCodes, destinationClass);

          const items = [];
          for (const item of plan.items) {
            const calc = await calculateItem({
              item,
              employeeLevelNumber: empLevelNumber,
              employeeGradeCode: empGradeCode,
              entitlements,
              cityClass: destinationClass,
              policy,
            });
            items.push({ ...item, expenseDate: item.expenseDate || plan.startDate, ...calc });
          }

          const requestedTotal = round2(items.reduce((s, i) => s + (i.requestedAmount || 0), 0));
          const allowedTotal = round2(items.reduce((s, i) => s + (i.allowedAmount || 0), 0));
          const excessTotal = round2(items.reduce((s, i) => s + (i.excessAmount || 0), 0));
          const isPaid = plan.status === 'DISBURSED' || plan.status === 'SETTLED' || plan.status === 'PAID';

          await safeDbCall(() => ExpenseClaim.create({
            companyId,
            company: companyId,
            claimNumber: `EXP-${emp.employeeIdCode || 'EMP'}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
            submittedBy: emp._id,
            submittedByName: emp.name,
            claimType: plan.type,
            employeeClaims: [
              {
                employee: {
                  employeeId: emp._id,
                  name: emp.name,
                  employeeIdCode: emp.employeeIdCode || '',
                  department: emp.department || '',
                  levelName: emp.levelRef?.name || 'Staff',
                  levelNumber: empLevelNumber,
                  levelRef: emp.levelRef?._id || emp.levelRef || null,
                  gradeCode: empGradeCode,
                  gradeRef: emp.gradeRef?._id || emp.gradeRef || null,
                  role: emp.role || '',
                },
                claimedBy: emp._id,
                items,
                requestedTotal,
                allowedTotal,
                excessTotal,
                itemCount: items.length,
              },
            ],
            employeeCount: 1,
            trip: {
              purpose: plan.purpose,
              destination: plan.destination,
              destinationClass,
              startDate: plan.startDate ? new Date(plan.startDate) : null,
              endDate: plan.endDate ? new Date(plan.endDate) : null,
              travelMode: plan.travelMode,
              tourSanctioned: true,
            },
            policyId: policy._id,
            policyVersion: policy.version || '1.0',
            policyCode: policy.code || '',
            policySnapshot: {
              code: policy.code,
              version: policy.version,
              source: policy.source,
              approvalRequired: policy.approvalRequired,
              sharedLodgingRule: policy.sharedLodgingRule,
            },
            approvalRequired: policy.approvalRequired,
            status: plan.status,
            paymentStatus: isPaid ? (plan.paymentStatus || 'PAID') : 'PENDING',
            paidAmount: isPaid ? (plan.paidAmount || allowedTotal) : 0,
            paymentMethod: isPaid ? (plan.paymentMethod || 'Bank Transfer (NEFT)') : '',
            utr: isPaid ? (plan.utr || 'HDFC98234710294') : '',
            accountsRemarks: isPaid ? (plan.accountsRemarks || 'Processed and disbursed.') : '',
            disbursedAt: isPaid ? new Date() : null,
            grandRequested: requestedTotal,
            grandAllowed: allowedTotal,
            grandExcess: excessTotal,
            submittedAt: new Date(plan.startDate),
            createdAt: new Date(plan.startDate),
            timeline: [
              {
                action: 'created',
                description: `Demo ${plan.type} claim created for ${emp.name}`,
                user: emp._id,
                timestamp: new Date(plan.startDate),
              },
              ...(plan.status !== 'DRAFT' ? [{
                action: 'submitted',
                description: 'Claim submitted for processing',
                user: emp._id,
                timestamp: new Date(plan.startDate),
              }] : []),
              ...(isPaid ? [{
                action: 'disbursed',
                description: `Payment disbursed: ₹${plan.paidAmount || allowedTotal} via ${plan.paymentMethod || 'Bank Transfer'}`,
                user: emp._id,
                timestamp: new Date(plan.startDate),
              }] : []),
            ],
          }), `Create Expense Claim for ${emp.name}`);
        }
        console.log(`✓ ${SEEDED_EXPENSE_PLANS.length} Demo Expense Claims seeded across Adesh Bhongale and other employees (excluding Preetam Dige).`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SEED SECOND TENANT COMPANY: Apex Innovations Ltd (APEX)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- Seeding Second Tenant Company (Apex Innovations Ltd) ---');
    let apexCompany = await safeDbCall(() => Company.findOne({ code: 'APEX' }), 'Find APEX');
    if (!apexCompany) {
      apexCompany = await safeDbCall(() => Company.create({
        name: 'Apex Innovations Ltd',
        code: 'APEX',
        companyCode: 'APEX',
        companyName: 'Apex Innovations Ltd',
        email: 'contact@apexinnovations.com',
        phone: '9876500099',
        address: 'Suite 402, Apex Business Center, Baner, Pune, MS 411045',
        status: 'ACTIVE',
        subscriptionPlan: 'ENTERPRISE',
        maxUsers: 50,
      }), 'Create APEX Company');
    }
    const apexCompanyId = apexCompany._id;

    // Levels for APEX
    const apexLevelDefs = [
      { levelNumber: 1, name: 'Executive Director', category: 'DIRECTOR', categoryPrefix: 'DI', canApprove: true, canAssign: true, canViewAll: true, companyId: apexCompanyId, company: apexCompanyId },
      { levelNumber: 2, name: 'Engineering Manager', category: 'MANAGEMENT', categoryPrefix: 'MN', canApprove: true, canAssign: true, canViewAll: true, companyId: apexCompanyId, company: apexCompanyId },
      { levelNumber: 3, name: 'Team Lead', category: 'LEADERSHIP', categoryPrefix: 'LD', canApprove: true, canAssign: true, canViewAll: false, companyId: apexCompanyId, company: apexCompanyId },
      { levelNumber: 4, name: 'Senior Developer', category: 'STAFF', usesDepartmentPrefix: true, canApprove: false, canAssign: false, canViewAll: false, companyId: apexCompanyId, company: apexCompanyId },
      { levelNumber: 5, name: 'Trainee Engineer', category: 'TRAINEE', usesDepartmentPrefix: true, canApprove: false, canAssign: false, canViewAll: false, companyId: apexCompanyId, company: apexCompanyId },
    ];
    for (const lDef of apexLevelDefs) {
      await safeDbCall(() => Level.findOneAndUpdate({ companyId: apexCompanyId, levelNumber: lDef.levelNumber }, lDef, { upsert: true, new: true }), 'Upsert APEX Level');
    }

    // Grades for APEX
    const apexGradeDefs = [
      { name: 'Grade Senior', code: 'a', gradeOrder: 1, gradeLabel: 'A', companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Grade Associate', code: 'b', gradeOrder: 2, gradeLabel: 'B', companyId: apexCompanyId, company: apexCompanyId },
    ];
    for (const gDef of apexGradeDefs) {
      await safeDbCall(() => Grade.findOneAndUpdate({ companyId: apexCompanyId, code: gDef.code }, gDef, { upsert: true, new: true }), 'Upsert APEX Grade');
    }

    // Departments for APEX
    const apexDeptDefs = [
      { name: 'Software Engineering', code: 'SF', prefix: 'SF', companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Human Resources', code: 'HR', prefix: 'HR', companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Sales & Marketing', code: 'SM', prefix: 'SM', companyId: apexCompanyId, company: apexCompanyId },
    ];
    const apexDeptMap = {};
    for (const dDef of apexDeptDefs) {
      const d = await safeDbCall(() => Department.findOneAndUpdate({ companyId: apexCompanyId, name: dDef.name }, dDef, { upsert: true, new: true }), 'Upsert APEX Department');
      apexDeptMap[dDef.name] = d._id;
    }

    // Designations for APEX
    const apexDesigDefs = [
      { name: 'Software Architect', department: apexDeptMap['Software Engineering'], companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Full Stack Engineer', department: apexDeptMap['Software Engineering'], companyId: apexCompanyId, company: apexCompanyId },
      { name: 'HR Manager', department: apexDeptMap['Human Resources'], companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Sales Manager', department: apexDeptMap['Sales & Marketing'], companyId: apexCompanyId, company: apexCompanyId },
    ];
    for (const des of apexDesigDefs) {
      await safeDbCall(() => Designation.findOneAndUpdate({ companyId: apexCompanyId, name: des.name }, des, { upsert: true, new: true }), 'Upsert APEX Designation');
    }

    // Shift for APEX
    let apexShift = await safeDbCall(() => Shift.findOne({ companyId: apexCompanyId, name: 'Apex General Shift' }), 'Find APEX Shift');
    if (!apexShift) {
      apexShift = await safeDbCall(() => Shift.create({
        name: 'Apex General Shift',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriodMinutes: 15,
        halfDayHours: 4,
        companyId: apexCompanyId,
        company: apexCompanyId,
      }), 'Create APEX Shift');
    }

    // Location for APEX
    let apexLoc = await safeDbCall(() => Location.findOne({ companyId: apexCompanyId, name: 'Apex HQ Baner' }), 'Find APEX Location');
    if (!apexLoc) {
      apexLoc = await safeDbCall(() => Location.create({
        name: 'Apex HQ Baner',
        address: 'Baner Tech Park, Pune',
        latitude: 18.5596,
        longitude: 73.7799,
        radiusMeters: 200,
        companyId: apexCompanyId,
        company: apexCompanyId,
      }), 'Create APEX Location');
    }

    // Leave Types for APEX
    const apexLeaveTypeDefs = [
      { name: 'Casual Leave', code: 'CL', daysAllowed: 12, companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Sick Leave', code: 'SL', daysAllowed: 8, companyId: apexCompanyId, company: apexCompanyId },
      { name: 'Paid Leave', code: 'PL', daysAllowed: 15, companyId: apexCompanyId, company: apexCompanyId },
    ];
    const apexLeaveTypes = [];
    for (const lt of apexLeaveTypeDefs) {
      const lType = await safeDbCall(() => LeaveType.findOneAndUpdate({ companyId: apexCompanyId, code: lt.code }, lt, { upsert: true, new: true }), 'Upsert APEX LeaveType');
      apexLeaveTypes.push(lType);
    }

    // Users for APEX
    let apexAdmin = await safeDbCall(() => User.findOne({ companyId: apexCompanyId, email: 'admin@apexinnovations.com' }), 'Find APEX Admin');
    if (!apexAdmin) {
      apexAdmin = await safeDbCall(() => User.create({
        name: 'Apex Company Admin',
        email: 'admin@apexinnovations.com',
        mobile: '9876500100',
        employeeIdCode: 'APEXADM01',
        employeeId: 'APEXADM01',
        password: 'Password123',
        role: 'company_admin',
        roleCode: 'APEXCA1',
        department: 'Human Resources',
        designation: 'HR Manager',
        status: 'ACTIVE',
        companyId: apexCompanyId,
        company: apexCompanyId,
        roleLevel: 1,
        roleGrade: 'A',
      }), 'Create APEX Admin');
    }

    let apexManager = await safeDbCall(() => User.findOne({ companyId: apexCompanyId, email: 'rahul.s@apexinnovations.com' }), 'Find APEX Manager');
    if (!apexManager) {
      apexManager = await safeDbCall(() => User.create({
        name: 'Rahul Sharma',
        email: 'rahul.s@apexinnovations.com',
        mobile: '9876500101',
        employeeIdCode: 'APEXMGR01',
        employeeId: 'APEXMGR01',
        password: 'Password123',
        role: 'team_lead',
        roleCode: 'APEXSF2A',
        department: 'Software Engineering',
        designation: 'Software Architect',
        status: 'ACTIVE',
        companyId: apexCompanyId,
        company: apexCompanyId,
        shift: apexShift._id,
        roleLevel: 3,
        roleGrade: 'A',
      }), 'Create APEX Manager');
    }

    let apexEmp1 = await safeDbCall(() => User.findOne({ companyId: apexCompanyId, email: 'anita.d@apexinnovations.com' }), 'Find APEX Emp1');
    if (!apexEmp1) {
      apexEmp1 = await safeDbCall(() => User.create({
        name: 'Anita Deshmukh',
        email: 'anita.d@apexinnovations.com',
        mobile: '9876500102',
        employeeIdCode: 'APEXEMP01',
        employeeId: 'APEXEMP01',
        password: 'Password123',
        role: 'employee',
        roleCode: 'APEXSF4A',
        department: 'Software Engineering',
        designation: 'Full Stack Engineer',
        status: 'ACTIVE',
        companyId: apexCompanyId,
        company: apexCompanyId,
        reportsTo: apexManager._id,
        shift: apexShift._id,
        roleLevel: 4,
        roleGrade: 'A',
      }), 'Create APEX Emp1');
    }

    let apexEmp2 = await safeDbCall(() => User.findOne({ companyId: apexCompanyId, email: 'kiran.v@apexinnovations.com' }), 'Find APEX Emp2');
    if (!apexEmp2) {
      apexEmp2 = await safeDbCall(() => User.create({
        name: 'Kiran Verma',
        email: 'kiran.v@apexinnovations.com',
        mobile: '9876500103',
        employeeIdCode: 'APEXEMP02',
        employeeId: 'APEXEMP02',
        password: 'Password123',
        role: 'employee',
        roleCode: 'APEXSF5B',
        department: 'Software Engineering',
        designation: 'Full Stack Engineer',
        status: 'ACTIVE',
        companyId: apexCompanyId,
        company: apexCompanyId,
        reportsTo: apexManager._id,
        shift: apexShift._id,
        roleLevel: 5,
        roleGrade: 'B',
      }), 'Create APEX Emp2');
    }

    // Attendance for APEX (Last 3 days)
    const attToday = new Date();
    for (let i = 0; i < 3; i++) {
      const attDate = new Date();
      attDate.setDate(attToday.getDate() - i);
      const dateStr = attDate.toISOString().split('T')[0];

      await safeDbCall(() => Attendance.findOneAndUpdate(
        { companyId: apexCompanyId, user: apexEmp1._id, date: dateStr },
        {
          user: apexEmp1._id,
          userName: apexEmp1.name,
          employeeId: apexEmp1._id,
          companyId: apexCompanyId,
          company: apexCompanyId,
          date: dateStr,
          checkIn: '09:05',
          checkOut: '18:10',
          status: 'Present',
          inStatus: 'ON_TIME',
          outStatus: 'NORMAL',
          totalHours: '9h 05m',
        },
        { upsert: true, new: true }
      ), 'Upsert APEX Attendance 1');

      await safeDbCall(() => Attendance.findOneAndUpdate(
        { companyId: apexCompanyId, user: apexEmp2._id, date: dateStr },
        {
          user: apexEmp2._id,
          userName: apexEmp2.name,
          employeeId: apexEmp2._id,
          companyId: apexCompanyId,
          company: apexCompanyId,
          date: dateStr,
          checkIn: '09:20',
          checkOut: '18:00',
          status: 'Present',
          inStatus: 'LATE',
          outStatus: 'NORMAL',
          totalHours: '8h 40m',
        },
        { upsert: true, new: true }
      ), 'Upsert APEX Attendance 2');
    }

    // Leave for APEX
    await safeDbCall(() => Leave.create({
      user: apexEmp1._id,
      userName: apexEmp1.name,
      leaveType: apexLeaveTypes[0]?._id,
      startDate: new Date(),
      endDate: new Date(),
      reason: 'Personal work',
      status: 'Approved',
      companyId: apexCompanyId,
      company: apexCompanyId,
    }), 'Create APEX Leave');

    // Customer & Visit for APEX
    let apexCust = await safeDbCall(() => Customer.findOneAndUpdate(
      { companyId: apexCompanyId, customerCode: 'APEX-CUST-01' },
      {
        customerName: 'TechCorp Solutions',
        customerCode: 'APEX-CUST-01',
        contactPerson: 'Milind Kulkarni',
        email: 'milind@techcorp.com',
        phone: '9822000000',
        city: 'Pune',
        companyId: apexCompanyId,
        company: apexCompanyId,
      },
      { upsert: true, new: true }
    ), 'Upsert APEX Customer');

    await safeDbCall(() => CustomerVisit.create({
      employeeId: apexEmp1._id,
      employeeName: apexEmp1.name,
      companyId: apexCompanyId,
      company: apexCompanyId,
      customerId: apexCust._id,
      customerName: apexCust.customerName,
      scheduledDate: new Date(),
      scheduledTime: '11:00 AM',
      status: 'Completed',
      purpose: 'Quarterly Project Review',
      notes: 'Discussed software release roadmap',
      createdBy: apexAdmin._id,
    }), 'Create APEX Visit');

    // Product & Material for APEX
    await safeDbCall(() => Product.findOneAndUpdate(
      { companyId: apexCompanyId, name: 'Apex IoT Gateway' },
      {
        name: 'Apex IoT Gateway',
        description: 'Industrial IoT Edge Gateway with Wireless Telemetry',
        models: [{
          modelName: 'APEX-GW-01',
          description: 'Standard 4G/WiFi Industrial Gateway',
          serialNumbers: ['GW01-001', 'GW01-002']
        }],
        companyId: apexCompanyId,
        createdBy: apexAdmin._id,
      },
      { upsert: true, new: true }
    ), 'Upsert APEX Product');

    await safeDbCall(() => Material.findOneAndUpdate(
      { companyId: apexCompanyId, code: 'MAT-SCAN-01' },
      {
        name: 'Wireless Scanner',
        code: 'MAT-SCAN-01',
        category: 'Electronics',
        uom: 'Pcs',
        companyId: apexCompanyId,
        createdBy: apexAdmin._id,
      },
      { upsert: true, new: true }
    ), 'Upsert APEX Material');

    console.log('✓ Second Tenant Company (Apex Innovations Ltd) seeded 100% cleanly!');

    console.log('\n===========================================================');
    console.log('  COMPREHENSIVE SEEDING FINISHED 100% CLEANLY!');
    console.log('===========================================================');

    process.exit(0);

  } catch (err) {
    console.error('Seeding error:', err.message);
    if (err.name === 'MongooseServerSelectionError') {
      console.error('\n────────────────────────────────────────────────────────────────────────');
      console.error('CONNECTION ERROR: Could not reach the configured MongoDB server.');
      console.error('If your remote Railway database is unreachable, please verify your');
      console.error('network connection, or set up a local MongoDB URI in your .env file:');
      console.error('  MONGO_URI="mongodb://127.0.0.1:27017/geo-attendance-hrms"');
      console.error('────────────────────────────────────────────────────────────────────────\n');
    }
    process.exit(1);
  }
};

seedData();
