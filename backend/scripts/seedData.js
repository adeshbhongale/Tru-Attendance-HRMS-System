const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../models/User');
const Shift = require('../models/Shift');
const Location = require('../models/Location');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Customer = require('../models/Customer');
const CustomerVisit = require('../models/CustomerVisit');
const { clearCloudinaryStorage } = require('../utils/cloudinary');

const seedData = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database for seeding...');

    const dataPath = path.join(__dirname, '../data/seed.json');
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Seed data file not found at ${dataPath}`);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // Clear existing data
    await Promise.all([
      User.deleteMany({ role: { $ne: 'admin' } }),
      Shift.deleteMany({}),
      Location.deleteMany({}),
      Attendance.deleteMany({}),
      Leave.deleteMany({}),
      Department.deleteMany({}),
      Designation.deleteMany({}),
      Customer.deleteMany({}),
      CustomerVisit.deleteMany({}),
      clearCloudinaryStorage(),
    ]);
    console.log('Database and Cloudinary storage cleared...');

    // Create Shifts
    let createdShifts = [];
    if (data.shifts && data.shifts.length > 0) {
      createdShifts = await Shift.insertMany(data.shifts);
      console.log(`${createdShifts.length} Shifts created`);
    }

    // Create Office Location
    let createdLocation = null;
    if (data.location) {
      createdLocation = await Location.create(data.location);
      console.log(`Location created: ${createdLocation.name}`);
    }

    // Map shifts to users and create them
    if (data.users && data.users.length > 0) {
      const usersWithShifts = data.users.map(user => {
        const shift = createdShifts.find(s => s.name === (user.shift || 'General Shift'));
        return {
          ...user,
          shift: shift ? shift._id : null,
          workingPlace: createdLocation ? createdLocation._id : null,
          password: 'password123' // Default password for all users
        };
      });

      const createdUsers = await User.create(usersWithShifts);
      console.log(`${createdUsers.length} Users created`);

      // Create corresponding Departments and Designations so counts show correctly
      const uniqueDepts = [...new Set(data.users.map(u => u.department).filter(Boolean))];
      const deptsToCreate = uniqueDepts.map(name => ({
        name,
        description: `${name} Department`,
        status: 'active'
      }));
      await Department.insertMany(deptsToCreate);
      console.log(`${deptsToCreate.length} Departments created`);

      const uniqueDesigs = [...new Set(data.users.map(u => u.designation).filter(Boolean))];
      const desigsToCreate = uniqueDesigs.map(name => ({
        name,
        description: `${name} Designation`,
        status: 'active'
      }));
      await Designation.insertMany(desigsToCreate);
      console.log(`${desigsToCreate.length} Designations created`);

      // Seed Attendance
      if (data.attendance && data.attendance.length > 0) {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Get unique dates from attendance data and sort them descending
        const uniqueDates = [...new Set(data.attendance.map(a => a.date))].sort((a, b) => b.localeCompare(a));
        const latestSeedDate = uniqueDates[0];

        const attendanceData = data.attendance.map(att => {
          const user = createdUsers.find(u => u.email === att.userEmail);
          if (!user) return null;

          const { userEmail, ...attDetails } = att;

          // Dynamically set date to today or yesterday
          // The latest date in seed.json becomes today, others become yesterday
          const targetDate = attDetails.date === latestSeedDate ? todayStr : yesterdayStr;
          attDetails.date = targetDate;

          // Update timestamps in punchIn, punchOut, and trackingLogs
          const updateTime = (timeStr) => {
            if (!timeStr) return timeStr;
            const time = new Date(timeStr);
            const target = new Date(targetDate);
            time.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
            return time.toISOString();
          };

          if (attDetails.punchIn) attDetails.punchIn.time = updateTime(attDetails.punchIn.time);
          if (attDetails.punchOut) attDetails.punchOut.time = updateTime(attDetails.punchOut.time);
          if (attDetails.trackingLogs) {
            attDetails.trackingLogs = attDetails.trackingLogs.map(log => ({
              ...log,
              time: updateTime(log.time)
            }));
          }

          // Calculate overtime
          let overtime = 0;
          if (user.shift && attDetails.workingHours) {
            const shift = createdShifts.find(s => s._id.toString() === user.shift.toString());
            if (shift && shift.workingHours) {
              overtime = Math.max(0, attDetails.workingHours - shift.workingHours);
            }
          }

          return { ...attDetails, user: user._id, overtime };
        }).filter(Boolean);

        // Add specific record for adesh employee on 1-5-2026
        const adesh = createdUsers.find(u => u.email === 'adesh@example.com');
        if (adesh) {
          attendanceData.push({
            user: adesh._id,
            date: '2026-05-01',
            status: 'Present',
            punchIn: {
              time: '2026-05-01T03:30:00Z',
              location: {
                latitude: 16.7041,
                longitude: 74.4502,
                address: 'Main Gate'
              }
            },
            punchOut: {
              time: '2026-05-01T12:00:00Z',
              location: {
                latitude: 16.7041,
                longitude: 74.4502,
                address: 'Main Gate'
              }
            },
            workingHours: 8.5,
            overtime: 0,
            trackingLogs: []
          });
        }

        if (attendanceData.length > 0) {
          await Attendance.insertMany(attendanceData);
          console.log(`${attendanceData.length} Attendance records created`);
        }
      }

      // Seed Leaves
      if (data.leaves && data.leaves.length > 0) {
        const leaveData = data.leaves.map(lv => {
          const user = createdUsers.find(u => u.email === lv.userEmail);
          if (!user) return null;
          const { userEmail, ...lvDetails } = lv;
          return { ...lvDetails, user: user._id };
        }).filter(Boolean);

        if (leaveData.length > 0) {
          await Leave.insertMany(leaveData);
          console.log(`${leaveData.length} Leave records created`);
        }
      }

      // Seed Customers
      const testCustomers = [
        {
          customerName: 'Sunitha Hospital',
          customerCode: 'CUST-100001',
          contactPerson: 'Dr. Sunitha',
          mobile: '9876543210',
          email: 'contact@sunithahospital.com',
          address: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          latitude: 16.305921,
          longitude: 80.439831,
          createdBy: createdUsers[0]._id,
        },
        {
          customerName: 'Metro Clinic',
          customerCode: 'CUST-100002',
          contactPerson: 'John Doe',
          mobile: '9876543211',
          email: 'info@metroclinic.com',
          address: 'Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          latitude: 16.305486,
          longitude: 80.438618,
          createdBy: createdUsers[0]._id,
        },
        {
          customerName: 'Balaji House',
          customerCode: 'CUST-100003',
          contactPerson: 'Srinivas Rao',
          mobile: '9876543212',
          email: 'srinivas@balajihouse.com',
          address: '6-12-58, Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          latitude: 16.305486,
          longitude: 80.438618,
          createdBy: createdUsers[0]._id,
        }
      ];

      const createdCustomers = await Customer.insertMany(testCustomers);
      console.log(`${createdCustomers.length} Customers created`);

      // Seed Customer Visits — all 5 statuses
      const targetEmp = createdUsers.find(u => u.role === 'employee') || createdUsers[0];
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(today.getDate() - 2);
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - 5);
      const futureDateNear = new Date(today);
      futureDateNear.setDate(today.getDate() + 2);
      const futureDateFar = new Date(today);
      futureDateFar.setDate(today.getDate() + 5);

      const testVisits = [
        // ── Completed Visits ──────────────────────────────────
        {
          customerId: createdCustomers[0]._id,
          customerName: createdCustomers[0].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: yesterday,
          scheduledTime: '10:00',
          status: 'Completed',
          startTime: new Date(yesterday.getTime() + 10.2 * 60 * 60 * 1000),
          endTime: new Date(yesterday.getTime() + 12.1 * 60 * 60 * 1000),
          startLatitude: 16.305921,
          startLongitude: 80.439831,
          startAddress: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          startLocation: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          startSelfie: 'https://i.pravatar.cc/150?u=v1_in',
          endLatitude: 16.305915,
          endLongitude: 80.439829,
          endAddress: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          endLocation: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          endSelfie: 'https://i.pravatar.cc/150?u=v1_out',
          reason: 'Regular check-up completed. All records reviewed.',
          createdBy: createdUsers[0]._id,
        },
        {
          customerId: createdCustomers[1]._id,
          customerName: createdCustomers[1].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: twoDaysAgo,
          scheduledTime: '14:30',
          status: 'Completed',
          startTime: new Date(twoDaysAgo.getTime() + 14.7 * 60 * 60 * 1000),
          endTime: new Date(twoDaysAgo.getTime() + 16.2 * 60 * 60 * 1000),
          startLatitude: 16.305486,
          startLongitude: 80.438618,
          startAddress: 'Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          startLocation: 'Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          startSelfie: 'https://i.pravatar.cc/150?u=v2_in',
          endLatitude: 16.305488,
          endLongitude: 80.438620,
          endAddress: 'Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          endLocation: 'Salipet, Arundelpet, Guntur, Andhra Pradesh 522601, India',
          endSelfie: 'https://i.pravatar.cc/150?u=v2_out',
          reason: 'Onboarding walkthrough done. Client satisfied.',
          createdBy: createdUsers[0]._id,
        },
        // ── Over Due Visits ───────────────────────────────────
        {
          customerId: createdCustomers[1]._id,
          customerName: createdCustomers[1].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: pastDate,
          scheduledTime: '14:30',
          status: 'Over Due',
          reason: 'Scheduled visit was not executed in time',
          createdBy: createdUsers[0]._id,
        },
        {
          customerId: createdCustomers[2]._id,
          customerName: createdCustomers[2].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          scheduledTime: '09:00',
          status: 'Over Due',
          reason: 'Client visit missed — no check-in recorded',
          createdBy: createdUsers[0]._id,
        },
        // ── To Do Visits (today) ──────────────────────────────
        {
          customerId: createdCustomers[2]._id,
          customerName: createdCustomers[2].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: today,
          scheduledTime: '11:00',
          status: 'To Do',
          reason: 'Routine visit — collect documents and sign contract',
          createdBy: createdUsers[0]._id,
        },
        {
          customerId: createdCustomers[0]._id,
          customerName: createdCustomers[0].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: today,
          scheduledTime: '15:30',
          status: 'To Do',
          reason: 'Post-delivery follow-up meeting',
          createdBy: createdUsers[0]._id,
        },
        // ── In Progress Visit (today, started) ───────────────
        {
          customerId: createdCustomers[0]._id,
          customerName: createdCustomers[0].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: today,
          scheduledTime: '13:00',
          status: 'In Progress',
          startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
          startLatitude: 16.305921,
          startLongitude: 80.439831,
          startAddress: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          startLocation: 'Arundelpet 11/2, Arundelpet, Guntur, Andhra Pradesh 522002, India',
          startSelfie: 'https://i.pravatar.cc/150?u=v_prog_in',
          reason: 'Follow-up meeting currently in progress',
          createdBy: createdUsers[0]._id,
        },
        // ── Upcoming Visits (future) ──────────────────────────
        {
          customerId: createdCustomers[1]._id,
          customerName: createdCustomers[1].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: futureDateNear,
          scheduledTime: '10:00',
          status: 'Upcoming',
          reason: 'Quarterly review meeting',
          createdBy: createdUsers[0]._id,
        },
        {
          customerId: createdCustomers[2]._id,
          customerName: createdCustomers[2].customerName,
          employeeId: targetEmp._id,
          employeeName: targetEmp.name,
          scheduledDate: futureDateFar,
          scheduledTime: '14:00',
          status: 'Upcoming',
          reason: 'Annual contract renewal discussion',
          createdBy: createdUsers[0]._id,
        },
      ];

      await CustomerVisit.insertMany(testVisits);
      console.log(`${testVisits.length} Customer Visit records created`);
    }

    console.log('Database seeded successfully');
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err.message);
    process.exit(1);
  }
};

seedData();
