const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Shift = require('../models/Shift');
const Location = require('../models/Location');
const statsService = require('../services/attendanceStatsService');
const geoService = require('../services/geoTrackingService');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // 1. Clear existing data
    await Promise.all([
      User.deleteMany(),
      Attendance.deleteMany(),
      Leave.deleteMany(),
      Shift.deleteMany(),
      Location.deleteMany()
    ]);
    console.log('Cleared existing collections.');

    // 2. Create Shifts
    const shifts = await Shift.insertMany([
      { name: 'Morning Shift', startTime: '08:00', endTime: '14:00', gracePeriod: 15, halfDayAfter: '10:00', workingHours: 8 },
      { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', gracePeriod: 15, halfDayAfter: '16:00', workingHours: 8 },
      { name: 'Night Shift', startTime: '22:00', endTime: '04:00', gracePeriod: 15, halfDayAfter: '00:00', workingHours: 8, isNightShift: true }
    ]);
    console.log(`Created ${shifts.length} Shifts.`);

    // 3. Create Office Location
    const office = await Location.create({
      name: 'Office Main HQ',
      latitude: 16.7018,
      longitude: 74.4496,
      radius: 200,
      address: 'Jawaharnagar, Ichalkaranji, Maharashtra, India'
    });
    console.log('Created Office Location.');

    // 4. Create Admin
    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);

    await User.create({
      name: 'Global Admin',
      email: 'admin@example.com',
      mobile: '9000000000',
      password: adminPassword,
      role: 'admin',
      department: 'Management'
    });
    console.log('Created Admin User (admin@example.com / admin123).');

    // 5. Create Employees
    const departments = ['IT', 'Sales', 'HR', 'Support', 'Logistics'];
    const employeeData = [];
    const empCount = 14;

    for (let i = 1; i <= empCount; i++) {
      const dept = departments[i % departments.length];
      const shift = shifts[i % shifts.length];
      const hashedPassword = await bcrypt.hash('password123', 10);

      employeeData.push({
        name: `Employee ${i}`,
        email: `emp${i}@example.com`,
        mobile: `91000000${i.toString().padStart(2, '0')}`,
        password: hashedPassword,
        role: 'employee',
        department: dept,
        designation: i % 2 === 0 ? 'Project Lead' : 'Systems Engineer',
        shift: shift._id,
        headquarter: i % 3 === 0 ? 'Ichalkaranji HQ' : 'Pune HQ',
        leaveBalance: 3,
        monthlyLeaveLimit: 3,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      });
    }

    // Add Fresh Test User (Adesh Bhongale)
    const adeshPassword = await bcrypt.hash('password123', 10);
    employeeData.push({
      name: 'Adesh Bhongale',
      email: 'adesh@example.com',
      mobile: '9876543210',
      password: adeshPassword,
      role: 'employee',
      department: 'Sales',
      designation: 'Sr.Sales Engineer',
      shift: shifts[0]._id,
      headquarter: 'Mumbai HQ',
      leaveBalance: 3,
      monthlyLeaveLimit: 3,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    });

    const employees = await User.insertMany(employeeData);
    console.log(`Created ${employees.length} Employees (including Adesh Bhongale).`);

    // 6. Generate History (Last 30 Days)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const attendanceRecords = [];
    const leaveRecords = [];

    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      date.setUTCDate(date.getUTCDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const isWeekend = date.getUTCDay() === 0; // Skip Sundays

      for (const emp of employees) {
        // SPECIAL CASE: Adesh Bhongale is ALWAYS fresh for today (not punched in)
        if (emp.name === 'Adesh Bhongale' && dateStr === todayStr) {
          continue;
        }

        if (isWeekend) continue;

        const empIndex = employees.indexOf(emp);

        // Randomly pick a shift for this specific day to simulate history of different shifts
        const dayShift = shifts[Math.floor(Math.random() * shifts.length)];
        const shift = dayShift;

        // Random Status Picker
        const rand = Math.random();

        if (rand < 0.12) { // 12% Leave
          const leaveStatusRand = Math.random();
          let leaveStatus = 'Approved';
          if (leaveStatusRand < 0.3) leaveStatus = 'Pending';
          else if (leaveStatusRand < 0.5) leaveStatus = 'Rejected';

          leaveRecords.push({
            user: emp._id,
            leaveType: leaveStatusRand < 0.5 ? 'Sick Leave' : 'Casual Leave',
            startDate: date,
            endDate: date,
            reason: leaveStatusRand < 0.5 ? 'Feeling unwell' : 'Personal work',
            status: leaveStatus
          });
          if (leaveStatus === 'Approved') continue;
        }

        if (rand < 0.18) { // 6% Absent (total 18% not present)
          attendanceRecords.push({
            user: emp._id,
            date: date,
            status: 'Absent',
            isLate: false,
            isHalfDay: false,
            workingHours: 0,
            shiftInfo: { name: shift.name, startTime: shift.startTime }
          });
          continue;
        }

        // Present/Late/Half-Day
        // Parse shift times
        const [sHour, sMin] = shift.startTime.split(':').map(Number);
        const [eHour, eMin] = shift.endTime.split(':').map(Number);
        const [hHour, hMin] = (shift.halfDayAfter || "11:00").split(':').map(Number);

        const punchIn = new Date(date);
        const punchOut = new Date(date);

        let status = 'Present';
        let isLate = false;
        let isHalfDay = false;

        const pRand = Math.random();
        if (pRand < 0.3) { // Late
          const lateMinutes = (shift.gracePeriod || 15) + Math.floor(Math.random() * 45) + 1;
          punchIn.setUTCHours(sHour, sMin + lateMinutes, 0);
          status = 'Late';
          isLate = true;
        } else if (pRand < 0.45) { // Half Day
          const halfDayDelay = Math.floor(Math.random() * 30) + 1;
          punchIn.setUTCHours(hHour, hMin + halfDayDelay, 0);
          status = 'Half Day';
          isHalfDay = true;
        } else { // On Time
          const earlyMinutes = Math.floor(Math.random() * 15);
          punchIn.setUTCHours(sHour, sMin - earlyMinutes, 0);
        }

        // Punch Out Logic
        if (isHalfDay) {
          punchOut.setUTCHours(eHour - 4, eMin, 0);
        } else {
          const stayMinutes = Math.floor(Math.random() * 60);
          punchOut.setUTCHours(eHour, eMin + stayMinutes, 0);
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
        const lateTimeVal = statsService.calculateLateTime({ punchIn: { time: punchIn } }, shift);
        const workingHoursVal = statsService.calculateWorkingHours({
          punchIn: { time: punchIn },
          punchOut: { time: punchOut },
          breaks: breaks
        });

        const seededDistance = (Math.random() * 15) + 5;

        // Generate Tracking Logs (Simulate movement throughout the day)
        const trackingLogs = [];
        const logCount = 8 + Math.floor(Math.random() * 8); // 8-16 logs
        const shiftDurationMs = punchOut.getTime() - punchIn.getTime();
        
        for (let l = 0; l < logCount; l++) {
          const logTime = new Date(punchIn.getTime() + (shiftDurationMs * (l / logCount)));
          // Slightly jitter the location around office
          const latJitter = (Math.random() - 0.5) * 0.05;
          const lngJitter = (Math.random() - 0.5) * 0.05;
          
          trackingLogs.push({
            time: logTime,
            latitude: office.latitude + latJitter,
            longitude: office.longitude + lngJitter,
            address: `${Math.floor(Math.random() * 500) + 1} ${office.address}`,
            isOutside: Math.random() < 0.3,
            distanceFromPrevious: Math.floor(Math.random() * 200) + 50
          });
        }

        attendanceRecords.push({
          user: emp._id,
          date: date,
          status: status,
          punchIn: {
            time: punchIn,
            location: { latitude: office.latitude, longitude: office.longitude, address: office.address },
            selfie: `https://i.pravatar.cc/150?u=${emp._id}in${d}`,
            isOutside: false
          },
          punchOut: {
            time: punchOut,
            location: { latitude: office.latitude, longitude: office.longitude, address: office.address },
            selfie: `https://i.pravatar.cc/150?u=${emp._id}out${d}`,
            isOutside: false
          },
          distance: parseFloat(seededDistance.toFixed(2)),
          totalDistance: parseFloat(seededDistance.toFixed(2)),
          shiftInfo: { name: shift.name, startTime: shift.startTime },
          breaks: breaks,
          isLate: lateTimeVal > 0,
          isHalfDay: isHalfDay,
          isOutside: Math.random() < 0.2,
          trackingLogs: trackingLogs,
          signalStatus: 'online'
        });
      }
    }

    await Attendance.insertMany(attendanceRecords);
    await Leave.insertMany(leaveRecords);

    console.log(`Successfully seeded:`);
    console.log(`- ${employees.length} Employees`);
    console.log(`- ${attendanceRecords.length} Attendance Records (30 Days)`);
    console.log(`- ${leaveRecords.length} Leave Records`);
    console.log('Seeding process finished.');
    process.exit();
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedData();
