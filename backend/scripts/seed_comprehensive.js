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
    await safeDbCall(() => User.deleteMany({ role: { $ne: 'admin' } }), 'Clear Users');
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

    // 2. Create Shifts
    const shifts = await safeDbCall(() => Shift.insertMany([
      {
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

    // 3. Create Office Location
    const office = await safeDbCall(() => Location.create({
      name: 'Office Main HQ',
      latitude: 16.685716,
      longitude: 74.249044,
      radius: 100,
      address: 'Pratibha Nagar, Pratibha Nagar, Kolhapur, Maharashtra, India'
    }), 'Create Location');
    // const office = await safeDbCall(() => Location.create({
    //   name: 'Office Main HQ',
    //   latitude: 16.703559,
    //   longitude: 74.450000,
    //   radius: 200,
    //   address: 'Jawaharnagar, Ichalkaranji, Maharashtra, India'
    // }), 'Create Location');
    console.log('Created Office Location.');

    // 3.5 Create Leave Types
    const leaveTypesData = await safeDbCall(() => LeaveType.insertMany([
      { name: 'Casual Leave', code: 'CL', limit: 2, genderRestriction: 'All', status: 'active', limitType: 'Monthly' },
      { name: 'Sick Leave', code: 'SL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Paid Leave', code: 'PL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Unpaid Leave', code: 'LWP', limit: 12, genderRestriction: 'All', status: 'active' }
    ]), 'Insert Leave Types');
    console.log(`Created ${leaveTypesData.length} Leave Types.`);

    // 3.6 Create Departments matching Role Permissions Matrix (ST, HR, OP, IT, FN, SL)
    const departmentsData = await safeDbCall(() => Department.insertMany([
      {
        name: 'Store',
        prefix: 'ST',
        description: 'Store & Godown Inventory Management',
        roleLevels: [
          { level: 1, name: 'Level 1 (Store Dept Head)' },
          { level: 2, name: 'Level 2 (Store Supervisor)' },
          { level: 3, name: 'Level 3 (Store Keeper)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'HR',
        prefix: 'HR',
        description: 'Human Resources & Recruitment',
        roleLevels: [
          { level: 1, name: 'Level 1 (HR Dept Head)' },
          { level: 2, name: 'Level 2 (HR Officer)' },
          { level: 3, name: 'Level 3 (HR Executive)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'Operations',
        prefix: 'OP',
        description: 'Site Operations & Project Management',
        roleLevels: [
          { level: 1, name: 'Level 1 (Ops Dept Head)' },
          { level: 2, name: 'Level 2 (Site Supervisor)' },
          { level: 3, name: 'Level 3 (Field Officer)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'Software',
        prefix: 'SF',
        description: 'Software Development & Engineering',
        roleLevels: [
          { level: 1, name: 'Level 1 (Software Dept Head)' },
          { level: 2, name: 'Level 2 (Lead Developer)' },
          { level: 3, name: 'Level 3 (Software Engineer)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'Finance',
        prefix: 'FN',
        description: 'Finance, Accounts & Audit',
        roleLevels: [
          { level: 1, name: 'Level 1 (Finance Dept Head)' },
          { level: 2, name: 'Level 2 (Senior Accountant)' },
          { level: 3, name: 'Level 3 (Accounts Executive)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'Sales',
        prefix: 'SL',
        description: 'Sales & Business Development',
        roleLevels: [
          { level: 1, name: 'Level 1 (Sales Manager)' },
          { level: 2, name: 'Level 2 (Sales Lead)' },
          { level: 3, name: 'Level 3 (Sales Executive)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      },
      {
        name: 'Management',
        prefix: 'MG',
        description: 'Executive Management & Enterprise Oversight',
        roleLevels: [
          { level: 1, name: 'Level 1 (Management Dept Head)' },
          { level: 2, name: 'Level 2 (Executive Officer)' },
          { level: 3, name: 'Level 3 (Management Associate)' }
        ],
        roleGrades: [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ]
      }
    ]), 'Insert Departments');
    console.log(`Created ${departmentsData.length} Departments.`);

    // 3.65 Create Holidays
    const holidaysData = await safeDbCall(() => Holiday.insertMany([
      { holiday_date: new Date('2026-01-01'), holiday_name: 'New Year Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-05-01'), holiday_name: 'Labour Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-05-27'), holiday_name: 'Bakrid', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-08-15'), holiday_name: 'Independence Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-10-02'), holiday_name: 'Gandhi Jayanti', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-12-25'), holiday_name: 'Christmas', holiday_type: 'd', status: 'active' }
    ]), 'Insert Holidays');
    console.log(`Created ${holidaysData.length} Holidays.`);

    // 3.7 Create Designations
    const designationsData = await safeDbCall(() => Designation.insertMany([
      { name: 'Software Engineer', description: 'Software Development' },
      { name: 'Project Lead', description: 'Team Lead & Project Management' },
      { name: 'Systems Engineer', description: 'Systems & Infrastructure' },
      { name: 'Sales Engineer', description: 'Sales Engineering' },
      { name: 'HR Manager', description: 'Human Resources Management' },
      { name: 'Support Analyst', description: 'Customer Support Analysis' }
    ]), 'Insert Designations');
    console.log(`Created ${designationsData.length} Designations.`);

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

    const employeeData = [];
    const empCount = 14;

    const hashedPassword = await bcrypt.hash('password123', 10);

    for (let i = 1; i <= empCount; i++) {
      const dept = deptNames[i % deptNames.length];
      const shift = shifts[i % shifts.length];
      const desig = desigNames[i % desigNames.length];
      const gender = genders[i % genders.length];
      const deptObj = departmentsData.find(d => d.name === dept);
      const level = (i % (deptObj?.roleLevels?.length || 3)) + 1;
      const grades = deptObj?.roleGrades?.map(g => g.grade) || ['a', 'b', 'c'];
      const grade = grades[i % grades.length];
      const roleCode = `TC${deptObj?.prefix || 'XX'}${level}${grade}`;

      const bg = bloodGroups[i % bloodGroups.length];
      const addr = sampleAddresses[i % sampleAddresses.length];
      const birthYear = 1990 + (i % 10);
      const dobDate = new Date(`${birthYear}-0${(i % 9) + 1}-15`);
      const ref1Name = sampleRefNames[i % sampleRefNames.length];
      const ref1Num = sampleRefNumbers[i % sampleRefNumbers.length];
      const ref2Name = sampleRefNames[(i + 1) % sampleRefNames.length];
      const ref2Num = sampleRefNumbers[(i + 1) % sampleRefNumbers.length];

      const isLevel1Mgt = i < 3;
      employeeData.push({
        name: isLevel1Mgt ? `Management Approver Employee ${i + 1}` : `Employee ${i}`,
        email: isLevel1Mgt ? `mgt_approver${i + 1}@example.com` : `emp${i}@example.com`,
        mobile: `91000000${i.toString().padStart(2, '0')}`,
        password: hashedPassword,
        role: isLevel1Mgt ? 'department_admin' : 'employee',
        departmentAdminType: isLevel1Mgt ? 'management' : undefined,
        roleLevel: isLevel1Mgt ? 1 : level,
        roleGrade: isLevel1Mgt ? 'a' : grade,
        roleCode: isLevel1Mgt ? `TCMG1a` : roleCode,
        department: isLevel1Mgt ? 'Management' : dept,
        designation: isLevel1Mgt ? `Executive Management Approver ${i + 1}` : desig,
        shift: shift._id,
        workingPlace: office._id,
        gender: gender,
        address: addr,
        dob: dobDate,
        bloodGroup: bg,
        referenceName1: ref1Name,
        referenceNumber1: ref1Num,
        referenceName2: ref2Name,
        referenceNumber2: ref2Num,
        documents: [
          {
            docType: 'Aadhar Card',
            docName: `Aadhar_Card_Employee_${i}.pdf`,
            fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/aadhar_sample.pdf',
            uploadedOn: new Date('2024-01-15')
          },
          {
            docType: 'PAN Card',
            docName: `PAN_Card_Employee_${i}.png`,
            fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/pan_sample.png',
            uploadedOn: new Date('2024-01-15')
          }
        ],
        joiningDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 Days Ago
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      });
    }

    // Add Dedicated Level 1 Department Head Managers connected to Role Access Matrix
    const departmentHeads = [
      { name: 'Management Dept Manager', email: 'managementhead@example.com', mobile: '9100000090', dept: 'Management', code: 'TCMG1a', role: 'department_admin', desig: 'Management Dept Lead' },
      { name: 'Store Dept Manager', email: 'storehead@example.com', mobile: '9100000091', dept: 'Store', code: 'TCST1a', role: 'department_admin', desig: 'Store Manager' },
      { name: 'HR Dept Manager', email: 'hrhead@example.com', mobile: '9100000092', dept: 'HR', code: 'TCHR1a', role: 'department_admin', desig: 'HR Manager' },
      { name: 'Ops Dept Manager', email: 'opshead@example.com', mobile: '9100000093', dept: 'Operations', code: 'TCOP1a', role: 'department_admin', desig: 'Site Operations Lead' },
      { name: 'Software Dept Manager', email: 'softwarehead@example.com', mobile: '9100000094', dept: 'Software', code: 'TCSF1a', role: 'department_admin', desig: 'Software Dept Lead' },
      { name: 'Finance Dept Manager', email: 'financehead@example.com', mobile: '9100000095', dept: 'Finance', code: 'TCFN1a', role: 'department_admin', desig: 'Finance & Accounts Manager' },
      { name: 'Sales Dept Manager', email: 'saleshead@example.com', mobile: '9100000096', dept: 'Sales', code: 'TCSL1a', role: 'department_admin', desig: 'Sales & Business Manager' },
    ];

    departmentHeads.forEach((head) => {
      employeeData.push({
        name: head.name,
        email: head.email,
        mobile: head.mobile,
        password: hashedPassword,
        role: head.role,
        roleLevel: 1,
        roleGrade: 'a',
        roleCode: head.code,
        department: head.dept,
        designation: head.desig,
        shift: shifts[0]._id,
        workingPlace: office._id,
        gender: 'Male',
        address: 'HQ Executive Block, Pratibha Nagar, Kolhapur',
        dob: new Date('1988-05-12'),
        bloodGroup: 'O+',
        referenceName1: 'Executive HR',
        referenceNumber1: '9822011223',
        joiningDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      });
    });

    // Add Fresh Test User (Adesh Bhongale)
    employeeData.push({
      name: 'Adesh Bhongale',
      email: 'adesh@example.com',
      mobile: '1000000000',
      password: hashedPassword,
      role: 'employee',
      roleLevel: 1,
      roleGrade: 'a',
      roleCode: 'TCSL1a',
      department: 'Sales',
      designation: 'Sales Engineer',
      shift: shifts[1]._id,
      workingPlace: office._id,
      gender: 'Male',
      address: 'Flat 502, Sky Line Residency, Tarabai Park, Kolhapur, Maharashtra 416003',
      dob: new Date('1996-08-20'),
      bloodGroup: 'O+',
      referenceName1: 'Vikram Joshi',
      referenceNumber1: '9960123456',
      referenceName2: 'Rajesh Sharma',
      referenceNumber2: '9822011223',
      documents: [
        {
          docType: 'Aadhar Card',
          docName: 'Aadhar_Adesh_Bhongale.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/aadhar_sample.pdf',
          uploadedOn: new Date('2024-01-15')
        },
        {
          docType: 'PAN Card',
          docName: 'PAN_Adesh_Bhongale.png',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/pan_sample.png',
          uploadedOn: new Date('2024-01-15')
        },
        {
          docType: 'Offer Letter',
          docName: 'Offer_Letter_Adesh.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/employee_documents/offer_letter_sample.pdf',
          uploadedOn: new Date('2024-01-15')
        }
      ],
      joiningDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 Days Ago
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    });

    const employees = await safeDbCall(() => User.insertMany(employeeData), 'Insert Employees');
    console.log(`Created ${employees.length} Employees (including Adesh Bhongale).`);

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

            attendanceRecords.push({
              _id: new mongoose.Types.ObjectId(),
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
              trackingLogs: trackingLogs,
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
            trackingLogs: [],
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

        attendanceRecords.push({
          _id: new mongoose.Types.ObjectId(),
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
          trackingLogs: trackingLogs,
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

    const createdCustomers = await safeDbCall(() => Customer.insertMany(testCustomers), 'Insert Customers');
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
    await safeDbCall(() => Vendor.insertMany(vendorsData), 'Insert Vendors');
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
    await safeDbCall(() => Product.insertMany(productsData), 'Insert Products');
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
    await safeDbCall(() => Material.insertMany(materialsData), 'Insert Materials');
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

    await safeDbCall(() => Vendor.insertMany(vendorsToSeed), 'Insert 5 Vendors');
    console.log(`Created ${vendorsToSeed.length} comprehensive Vendors with all fields!`);

    console.log('Seeding process finished.');
    process.exit();

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
