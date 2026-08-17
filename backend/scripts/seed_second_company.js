const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

const Company = require('../models/Company');
const User = require('../models/User');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Shift = require('../models/Shift');
const Location = require('../models/Location');
const LeaveType = require('../models/LeaveType');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Customer = require('../models/Customer');
const CustomerVisit = require('../models/CustomerVisit');
const Product = require('../models/Product');
const Material = require('../models/Material');
const Responsibility = require('../models/Responsibility');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedSecondCompany = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    console.log('Connected to MongoDB successfully!');

    // 1. Create or Find Second Tenant Company
    let apexCompany = await Company.findOne({ code: 'APEX' });
    if (!apexCompany) {
      apexCompany = await Company.create({
        name: 'Apex Innovations Ltd',
        code: 'APEX',
        email: 'contact@apexinnovations.com',
        phone: '9876500099',
        address: 'Suite 402, Apex Business Center, Baner, Pune, MS 411045',
        status: 'ACTIVE',
        subscriptionPlan: 'ENTERPRISE',
        maxUsers: 50,
      });
      console.log('Created Company: Apex Innovations Ltd (APEX)');
    } else {
      console.log('Company Apex Innovations Ltd (APEX) already exists.');
    }

    const companyId = apexCompany._id;

    // 2. Hash default password
    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('Password123', salt);

    // 3. Create Level Masters for APEX
    const levelDefs = [
      { levelNumber: 1, name: 'Executive Director', category: 'DIRECTOR', categoryPrefix: 'DI', canApprove: true, canAssign: true, canViewAll: true, companyId },
      { levelNumber: 2, name: 'Engineering Manager', category: 'MANAGEMENT', categoryPrefix: 'MN', canApprove: true, canAssign: true, canViewAll: true, companyId },
      { levelNumber: 3, name: 'Team Lead', category: 'LEADERSHIP', categoryPrefix: 'LD', canApprove: true, canAssign: true, canViewAll: false, companyId },
      { levelNumber: 4, name: 'Senior Developer', category: 'STAFF', usesDepartmentPrefix: true, canApprove: false, canAssign: false, canViewAll: false, companyId },
      { levelNumber: 5, name: 'Trainee Engineer', category: 'TRAINEE', usesDepartmentPrefix: true, canApprove: false, canAssign: false, canViewAll: false, companyId },
    ];

    const apexLevels = [];
    for (const lDef of levelDefs) {
      let lvl = await Level.findOne({ companyId, levelNumber: lDef.levelNumber });
      if (!lvl) {
        lvl = await Level.create(lDef);
      }
      apexLevels.push(lvl);
    }
    console.log(`Seeded ${apexLevels.length} Level Masters for APEX.`);

    // 4. Create Grade Masters for APEX
    const gradeDefs = [
      { name: 'Grade Senior', code: 'a', order: 1, companyId },
      { name: 'Grade Associate', code: 'b', order: 2, companyId },
    ];
    const apexGrades = [];
    for (const gDef of gradeDefs) {
      let grd = await Grade.findOne({ companyId, code: gDef.code });
      if (!grd) {
        grd = await Grade.create(gDef);
      }
      apexGrades.push(grd);
    }
    console.log(`Seeded ${apexGrades.length} Grade Masters for APEX.`);

    // 5. Create Departments for APEX
    const deptDefs = [
      { name: 'Software Engineering', code: 'SF', prefix: 'SF', companyId },
      { name: 'Human Resources', code: 'HR', prefix: 'HR', companyId },
      { name: 'Sales & Marketing', code: 'SM', prefix: 'SM', companyId },
    ];
    const deptMap = {};
    for (const dDef of deptDefs) {
      let d = await Department.findOne({ companyId, name: dDef.name });
      if (!d) {
        d = await Department.create(dDef);
      }
      deptMap[dDef.name] = d._id;
    }

    // 6. Create Designations for APEX
    const desigDefs = [
      { name: 'Software Architect', department: deptMap['Software Engineering'], companyId },
      { name: 'Full Stack Engineer', department: deptMap['Software Engineering'], companyId },
      { name: 'HR Manager', department: deptMap['Human Resources'], companyId },
      { name: 'Sales Manager', department: deptMap['Sales & Marketing'], companyId },
    ];
    for (const des of desigDefs) {
      await Designation.findOneAndUpdate(
        { companyId, name: des.name },
        des,
        { upsert: true, new: true }
      );
    }

    // 7. Create Shift for APEX
    let apexShift = await Shift.findOne({ companyId, name: 'Apex General Shift' });
    if (!apexShift) {
      apexShift = await Shift.create({
        name: 'Apex General Shift',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriodMinutes: 15,
        halfDayHours: 4,
        companyId,
      });
    }

    // 8. Create Location for APEX
    let apexLoc = await Location.findOne({ companyId, name: 'Apex HQ Baner' });
    if (!apexLoc) {
      apexLoc = await Location.create({
        name: 'Apex HQ Baner',
        address: 'Baner Tech Park, Pune',
        latitude: 18.5596,
        longitude: 73.7799,
        radiusMeters: 200,
        companyId,
      });
    }

    // 9. Create Leave Types for APEX
    const leaveTypeDefs = [
      { name: 'Casual Leave', code: 'CL', daysAllowed: 12, companyId },
      { name: 'Sick Leave', code: 'SL', daysAllowed: 8, companyId },
      { name: 'Paid Leave', code: 'PL', daysAllowed: 15, companyId },
    ];
    const apexLeaveTypes = [];
    for (const lt of leaveTypeDefs) {
      let lType = await LeaveType.findOne({ companyId, code: lt.code });
      if (!lType) {
        lType = await LeaveType.create(lt);
      }
      apexLeaveTypes.push(lType);
    }

    // 10. Create Users / Employees for APEX
    // Company Admin
    let companyAdmin = await User.findOne({ companyId, role: 'company_admin' });
    if (!companyAdmin) {
      companyAdmin = await User.create({
        name: 'Apex Company Admin',
        email: 'admin@apexinnovations.com',
        mobile: '9876500100',
        employeeIdCode: 'APEXADM01',
        employeeId: 'APEXADM01',
        password: defaultPasswordHash,
        role: 'company_admin',
        roleCode: 'APEXCA1',
        department: 'Human Resources',
        designation: 'HR Manager',
        status: 'ACTIVE',
        companyId,
        roleLevel: 1,
        roleGrade: 'A',
      });
    }

    // Manager / Team Lead
    let manager = await User.findOne({ companyId, email: 'rahul.s@apexinnovations.com' });
    if (!manager) {
      manager = await User.create({
        name: 'Rahul Sharma',
        email: 'rahul.s@apexinnovations.com',
        mobile: '9876500101',
        employeeIdCode: 'APEXMGR01',
        employeeId: 'APEXMGR01',
        password: defaultPasswordHash,
        role: 'team_lead',
        roleCode: 'APEXSF2A',
        department: 'Software Engineering',
        designation: 'Software Architect',
        status: 'ACTIVE',
        companyId,
        shift: apexShift._id,
        roleLevel: 3,
        roleGrade: 'A',
      });
    }

    // Employee 1
    let emp1 = await User.findOne({ companyId, email: 'anita.d@apexinnovations.com' });
    if (!emp1) {
      emp1 = await User.create({
        name: 'Anita Deshmukh',
        email: 'anita.d@apexinnovations.com',
        mobile: '9876500102',
        employeeIdCode: 'APEXEMP01',
        employeeId: 'APEXEMP01',
        password: defaultPasswordHash,
        role: 'employee',
        roleCode: 'APEXSF4A',
        department: 'Software Engineering',
        designation: 'Full Stack Engineer',
        status: 'ACTIVE',
        companyId,
        reportsTo: manager._id,
        shift: apexShift._id,
        roleLevel: 4,
        roleGrade: 'A',
      });
    }

    // Employee 2
    let emp2 = await User.findOne({ companyId, email: 'kiran.v@apexinnovations.com' });
    if (!emp2) {
      emp2 = await User.create({
        name: 'Kiran Verma',
        email: 'kiran.v@apexinnovations.com',
        mobile: '9876500103',
        employeeIdCode: 'APEXEMP02',
        employeeId: 'APEXEMP02',
        password: defaultPasswordHash,
        role: 'employee',
        roleCode: 'APEXSF5B',
        department: 'Software Engineering',
        designation: 'Full Stack Engineer',
        status: 'ACTIVE',
        companyId,
        reportsTo: manager._id,
        shift: apexShift._id,
        roleLevel: 5,
        roleGrade: 'B',
      });
    }

    console.log('Seeded Users for APEX (Company Admin, Manager, 2 Staff).');

    // 11. Seed Attendance for APEX (Last 3 days)
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const attDate = new Date();
      attDate.setDate(today.getDate() - i);
      const dateStr = attDate.toISOString().split('T')[0];

      // Attendance for Anita
      const att1 = await Attendance.findOne({ companyId, user: emp1._id, date: dateStr });
      if (!att1) {
        await Attendance.create({
          user: emp1._id,
          userName: emp1.name,
          employeeId: emp1._id,
          companyId,
          date: dateStr,
          checkIn: '09:05',
          checkOut: '18:10',
          status: 'Present',
          inStatus: 'ON_TIME',
          outStatus: 'NORMAL',
          totalHours: '9h 05m',
        });
      }

      // Attendance for Kiran
      const att2 = await Attendance.findOne({ companyId, user: emp2._id, date: dateStr });
      if (!att2) {
        await Attendance.create({
          user: emp2._id,
          userName: emp2.name,
          employeeId: emp2._id,
          companyId,
          date: dateStr,
          checkIn: '09:20',
          checkOut: '18:00',
          status: 'Present',
          inStatus: 'LATE',
          outStatus: 'NORMAL',
          totalHours: '8h 40m',
        });
      }
    }
    console.log('Seeded Attendance for APEX.');

    // 12. Seed Leaves for APEX
    let sampleLeave = await Leave.findOne({ companyId, user: emp1._id });
    if (!sampleLeave) {
      await Leave.create({
        user: emp1._id,
        leaveType: apexLeaveTypes[0]?._id,
        startDate: new Date(),
        endDate: new Date(),
        reason: 'Personal work',
        status: 'Approved',
        companyId,
      });
    }

    // 13. Seed Customers & Visits for APEX
    let apexCust = await Customer.findOne({ companyId, customerName: 'TechCorp Solutions' });
    if (!apexCust) {
      apexCust = await Customer.create({
        customerName: 'TechCorp Solutions',
        customerCode: 'APEX-CUST-01',
        contactPerson: 'Milind Kulkarni',
        email: 'milind@techcorp.com',
        phone: '9822000000',
        city: 'Pune',
        companyId,
      });
    }

    let apexVisit = await CustomerVisit.findOne({ companyId, customerId: apexCust._id });
    if (!apexVisit) {
      await CustomerVisit.create({
        employeeId: emp1._id,
        employeeName: emp1.name,
        companyId,
        customerId: apexCust._id,
        customerName: apexCust.customerName,
        scheduledDate: new Date(),
        scheduledTime: '11:00 AM',
        status: 'Completed',
        purpose: 'Quarterly Project Review',
        notes: 'Discussed software release roadmap',
        createdBy: companyAdmin._id,
      });
    }

    // 14. Seed Product & Material for APEX
    let apexProd = await Product.findOne({ companyId, name: 'Apex IoT Gateway' });
    if (!apexProd) {
      await Product.create({
        name: 'Apex IoT Gateway',
        sku: 'APEX-GW-01',
        category: 'Hardware',
        price: 15000,
        unit: 'Pcs',
        companyId,
      });
    }

    let apexMat = await Material.findOne({ companyId, name: 'Wireless Scanner' });
    if (!apexMat) {
      await Material.create({
        name: 'Wireless Scanner',
        code: 'MAT-SCAN-01',
        category: 'Electronics',
        stockQuantity: 25,
        unit: 'Pcs',
        companyId,
      });
    }

    console.log('✅ Successfully seeded concise data for Apex Innovations Ltd (APEX)!');
  } catch (err) {
    console.error('Error seeding second company:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

seedSecondCompany();
