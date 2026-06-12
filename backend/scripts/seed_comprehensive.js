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

    const { clearCloudinaryStorage } = require('../utils/cloudinary');

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
      latitude: 16.703559,
      longitude: 74.450000,
      radius: 200,
      address: 'Jawaharnagar, Ichalkaranji, Maharashtra, India'
    }), 'Create Location');
    console.log('Created Office Location.');

    // 3.5 Create Leave Types
    const leaveTypesData = await safeDbCall(() => LeaveType.insertMany([
      { name: 'Casual Leave', code: 'CL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Sick Leave', code: 'SL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Paid Leave', code: 'PL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Unpaid Leave', code: 'LWP', limit: 6, genderRestriction: 'All', status: 'active' }
    ]), 'Insert Leave Types');
    console.log(`Created ${leaveTypesData.length} Leave Types.`);

    // 3.6 Create Departments
    const departmentsData = await safeDbCall(() => Department.insertMany([
      { name: 'IT', description: 'Information Technology' },
      { name: 'Sales', description: 'Sales & Marketing' },
      { name: 'HR', description: 'Human Resources' },
      { name: 'Support', description: 'Customer Support' },
      { name: 'Logistics', description: 'Logistics & Supply Chain' }
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

    // 4. Create Employees
    const deptNames = ['IT', 'Sales', 'HR', 'Support', 'Logistics'];
    const desigNames = ['Software Engineer', 'Project Lead', 'Systems Engineer', 'Sales Engineer', 'HR Manager', 'Support Analyst'];
    const genders = ['Male', 'Female'];
    const employeeData = [];
    const empCount = 14;

    const hashedPassword = await bcrypt.hash('password123', 10);

    for (let i = 1; i <= empCount; i++) {
      const dept = deptNames[i % deptNames.length];
      const shift = shifts[i % shifts.length];
      const desig = desigNames[i % desigNames.length];
      const gender = genders[i % genders.length];

      employeeData.push({
        name: `Employee ${i}`,
        email: `emp${i}@example.com`,
        mobile: `91000000${i.toString().padStart(2, '0')}`,
        password: hashedPassword,
        role: 'employee',
        department: dept,
        designation: desig,
        shift: shift._id,
        workingPlace: office._id,
        gender: gender,
        joiningDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 Days Ago
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      });
    }

    // Add Fresh Test User (Adesh Bhongale)
    employeeData.push({
      name: 'Adesh Bhongale',
      email: 'adesh@example.com',
      mobile: '1000000000',
      password: hashedPassword,
      role: 'employee',
      department: 'Sales',
      designation: 'Sales Engineer',
      shift: shifts[1]._id,
      workingPlace: office._id,
      gender: 'Male',
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
              const distanceMeters = 1 + (Math.random() * 9);
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
          // Small random jump between 1m (0.000009 deg) and 10m (0.00009 deg)
          const angle = Math.random() * Math.PI * 2;
          const distanceMeters = 1 + (Math.random() * 9);
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

    // 6.5 Seed Customers
    console.log('Seeding Customers...');
    const adminUser = await safeDbCall(() => User.findOne({ role: 'admin' }), 'Find admin') || employees[0];
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
        createdBy: adminUser._id,
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
        createdBy: adminUser._id,
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
        createdBy: adminUser._id,
      },
      {
        customerName: 'Apollo Hospital',
        customerCode: 'CUST-100004',
        contactPerson: 'Dr. Prasad',
        mobile: '9876543213',
        email: 'info@apollohospital.com',
        address: 'NTR Marg, Guntur, Andhra Pradesh 522004, India',
        latitude: 16.307500,
        longitude: 80.441000,
        createdBy: adminUser._id,
      },
      {
        customerName: 'Care Clinic',
        customerCode: 'CUST-100005',
        contactPerson: 'Dr. Sireesha',
        mobile: '9876543214',
        email: 'sireesha@careclinic.com',
        address: 'Laxmipuram, Guntur, Andhra Pradesh 522007, India',
        latitude: 16.304200,
        longitude: 80.437200,
        createdBy: adminUser._id,
      },
      {
        customerName: 'City Health Center',
        customerCode: 'CUST-100006',
        contactPerson: 'Dr. Ramana',
        mobile: '9876543215',
        email: 'ramana@cityhealth.com',
        address: 'Broadipet, Guntur, Andhra Pradesh 522002, India',
        latitude: 16.308100,
        longitude: 80.442500,
        createdBy: adminUser._id,
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
      if (updated) {
        await safeDbCall(() => emp.save(), `Save employee ${emp.name}`);
        updatedCount++;
      }
    }
    console.log(`Normalized ${updatedCount} existing employee records.`);

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
          type: 'emergancy notification',
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
