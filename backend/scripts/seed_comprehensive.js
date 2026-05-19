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
const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const statsService = require('../services/attendanceStatsService');
const geoService = require('../services/geoTrackingService');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedData = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('CRITICAL ERROR: MONGO_URI is not defined in your .env file.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log('Connection Successful!');

    const { clearCloudinaryStorage } = require('../utils/cloudinary');
    
    const saveInBatches = async (Model, records, batchSize = 100) => {
      for (let i = 0; i < records.length; i += batchSize) {
        const chunk = records.slice(i, i + batchSize);
        let retries = 3;
        while (retries > 0) {
          try {
            await Model.insertMany(chunk);
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
    await User.deleteMany({ role: { $ne: 'admin' } });
    await Attendance.deleteMany();
    await Leave.deleteMany();
    await Shift.deleteMany();
    await LeaveType.deleteMany();
    await Location.deleteMany();
    await Department.deleteMany();
    await Designation.deleteMany();
    await Holiday.deleteMany();
    
    try {
      console.log('Clearing Cloudinary storage...');
      await clearCloudinaryStorage();
    } catch (cErr) {
      console.warn('Cloudinary clearing failed, skipping:', cErr.message);
    }
    console.log('Cleared existing collections and Cloudinary storage.');

    // 2. Create Shifts
    const shifts = await Shift.insertMany([
      {
        name: 'Morning Shift',
        startTime: '08:00',
        endTime: '16:00',
        gracePeriod: 15,
        halfDayAfter: '12:00',
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
        halfDayAfter: '20:00',
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
        halfDayAfter: '04:00',
        workingHours: 8,
        weeklyOff: ['Sunday'],
        lateRules: "If you are late then your payment will be deducted by 10% of the day's salary.",
        halfDayRules: "If you leave for half day then your payment will be deducted by 50% of the day's salary.",
        status: 'active'
      }
    ]);
    console.log(`Created ${shifts.length} Shifts.`);

    // 3. Create Office Location
    const office = await Location.create({
      name: 'Office Main HQ',
      latitude: 16.703559,
      longitude: 74.450000,
      radius: 200,
      address: 'Jawaharnagar, Ichalkaranji, Maharashtra, India'
    });
    console.log('Created Office Location.');

    // 3.5 Create Leave Types
    const leaveTypesData = await LeaveType.insertMany([
      { name: 'Casual Leave', code: 'CL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Sick Leave', code: 'SL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Paid Leave', code: 'PL', limit: 6, genderRestriction: 'All', status: 'active' },
      { name: 'Unpaid Leave', code: 'LWP', limit: 6, genderRestriction: 'All', status: 'active' }
    ]);
    console.log(`Created ${leaveTypesData.length} Leave Types.`);

    // 3.6 Create Departments
    const departmentsData = await Department.insertMany([
      { name: 'IT', description: 'Information Technology' },
      { name: 'Sales', description: 'Sales & Marketing' },
      { name: 'HR', description: 'Human Resources' },
      { name: 'Support', description: 'Customer Support' },
      { name: 'Logistics', description: 'Logistics & Supply Chain' }
    ]);
    console.log(`Created ${departmentsData.length} Departments.`);

    // 3.65 Create Holidays
    const holidaysData = await Holiday.insertMany([
      { holiday_date: new Date('2026-01-01'), holiday_name: 'New Year Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-05-01'), holiday_name: 'Labour Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-08-15'), holiday_name: 'Independence Day', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-10-02'), holiday_name: 'Gandhi Jayanti', holiday_type: 'd', status: 'active' },
      { holiday_date: new Date('2026-12-25'), holiday_name: 'Christmas', holiday_type: 'd', status: 'active' }
    ]);
    console.log(`Created ${holidaysData.length} Holidays.`);

    // 3.7 Create Designations
    const designationsData = await Designation.insertMany([
      { name: 'Software Engineer', description: 'Software Development' },
      { name: 'Project Lead', description: 'Team Lead & Project Management' },
      { name: 'Systems Engineer', description: 'Systems & Infrastructure' },
      { name: 'Sales Engineer', description: 'Sales Engineering' },
      { name: 'HR Manager', description: 'Human Resources Management' },
      { name: 'Support Analyst', description: 'Customer Support Analysis' }
    ]);
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
      mobile: '100000000',
      password: hashedPassword,
      role: 'employee',
      department: 'Sales',
      designation: 'Sales Engineer',
      shift: shifts[0]._id,
      workingPlace: office._id,
      gender: 'Male',
      joiningDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
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
        // 1. Skip if date is before employee joining date
        const empJoined = new Date(emp.joiningDate);
        empJoined.setUTCHours(0, 0, 0, 0);
        const currentD = new Date(date);
        currentD.setUTCHours(0, 0, 0, 0);

        if (currentD < empJoined) continue;

        // 2. SPECIAL CASE: Adesh Bhongale is ALWAYS fresh for today (not punched in)
        if (emp.name === 'Adesh Bhongale' && dateStr === todayStr) {
          continue;
        }

        const holidayDates = ['2026-01-01', '2026-05-01', '2026-08-15', '2026-10-02', '2026-12-25'];
        const isHoliday = holidayDates.includes(dateStr);

        if (isWeekend || isHoliday) continue;

        const empIndex = employees.indexOf(emp);

        // Randomly pick a shift for this specific day to simulate history of different shifts
        const dayShift = shifts[Math.floor(Math.random() * shifts.length)];
        const shift = dayShift;

        // Random Status Picker
        const rand = Math.random();

        if (rand < 0.12) { // 12% Leave
          const leaveStatusRand = Math.random();
          let leaveStatus = 'Approved';
          if (leaveStatusRand < 0.2) leaveStatus = 'Pending';
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

        else if (rand < 0.18) { // 6% Absent (total 18% not present)
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
        if (pRand < 0.2) { // Late (20%)
          const lateMinutes = (shift.gracePeriod || 15) + Math.floor(Math.random() * 20) + 1;
          punchIn.setUTCHours(sHour, sMin + lateMinutes, 0);
        } else if (pRand < 0.35) { // Half Day (Arrived Late) (15%)
          const halfDayDelay = Math.floor(Math.random() * 60) + 30; // 30-90 mins past cutoff
          const [hH, hM] = (shift.halfDayAfter || "11:00").split(':').map(Number);
          punchIn.setUTCHours(hH, hM + halfDayDelay, 0);
        } else { // On Time
          const earlyMinutes = Math.floor(Math.random() * 15);
          punchIn.setUTCHours(sHour, sMin - earlyMinutes, 0);
        }

        // ── FIX: Ensure 'Today' records are in the past so hours are non-zero ──
        if (dateStr === todayStr) {
          // If punchIn is in the future relative to now, shift it back by 4 hours
          const currentRealTime = new Date();
          if (punchIn > currentRealTime) {
            punchIn.setTime(currentRealTime.getTime() - (4 * 60 * 60 * 1000)); // 4 hours ago
          }
        }

        // ── Punch Out Logic: 6-10 hrs as requested ──
        let durationHours;
        if (isHalfDay) {
          durationHours = 3.5 + (Math.random() * 1); // 3.5 to 4.5 hrs for Half Day
        } else {
          durationHours = 6 + (Math.random() * 4);   // 6 to 10 hrs for Full Day
        }

        punchOut.setTime(punchIn.getTime() + (durationHours * 60 * 60 * 1000));



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
          punchIn: { time: punchIn },
          punchOut: { time: punchOut },
          breaks: breaks,
          shiftInfo: shift
        };

        status = statsService.resolveStatus(tempAtt, emp);
        isHalfDay = status === 'Half Day';
        isLate = status === 'Late';
        const lateTimeVal = statsService.calculateLateTime({ punchIn: { time: punchIn } }, shift);
        const workingHoursVal = statsService.calculateWorkingHours(tempAtt);

        const trackingLogs = [];
        let totalDistanceKm = 0;
        const durationMs = punchOut.getTime() - punchIn.getTime();
        let currentTime = new Date(punchIn);
        let lastLat = office.latitude;
        let lastLng = office.longitude;

        // --- ULTRA-DENSE MICRO-TRACKING (Exactly 10 points, 1-10m increments) ---
        const totalLogCount = 10;
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
          // Canonical service computes this — stored in DB so APIs always return consistent data
          workingHours: parseFloat(workingHoursVal.toFixed(2)),
          lateTime: lateTimeVal,
          isOutside: finalLog.isOutside,
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

    // 5.Enhanced leaves seeding (Past, Current, Future, Half-Day, All Statuses)
    const leaveTypes = ['Sick Leave', 'Casual Leave', 'Paid Leave', 'Unpaid Leave'];
    const statuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
    const durations = ['Full Day', 'Half Day'];

    for (const emp of employees) {
      // 1. Past Leaves (Last 60 days) - for historical analytics
      for (let i = 0; i < 4; i++) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - (Math.floor(Math.random() * 60) + 10));
        if (pastDate < new Date(emp.joiningDate)) continue;
        const endPastDate = new Date(pastDate);
        if (Math.random() < 0.2) endPastDate.setDate(pastDate.getDate() + 1);

        leaveRecords.push({
          user: emp._id,
          leaveType: leaveTypes[Math.floor(Math.random() * leaveTypes.length)],
          startDate: pastDate,
          endDate: endPastDate,
          duration: durations[Math.floor(Math.random() * durations.length)],
          startTime: '09:00',
          endTime: '13:00',
          reason: 'Historical leave for testing counts',
          status: statuses[Math.floor(Math.random() * statuses.length)],
          createdAt: pastDate,
          appliedOn: pastDate
        });
      }

      // 2. Recent/Today Leaves (Today +/- 5 days)
      for (let i = 0; i < 2; i++) {
        const currDate = new Date();
        currDate.setDate(currDate.getDate() + (Math.floor(Math.random() * 10) - 5));
        if (currDate < new Date(emp.joiningDate)) continue;
        const endCurrDate = new Date(currDate);

        leaveRecords.push({
          user: emp._id,
          leaveType: leaveTypes[Math.floor(Math.random() * leaveTypes.length)],
          startDate: currDate,
          endDate: endCurrDate,
          duration: durations[Math.floor(Math.random() * durations.length)],
          startTime: '10:00',
          endTime: '14:00',
          reason: 'Recent requirement',
          status: statuses[Math.floor(Math.random() * statuses.length)],
          createdAt: new Date(),
          appliedOn: new Date()
        });
      }

      // 3. Future Leaves (Next 3 months)
      for (let i = 1; i <= 3; i++) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + i);
        futureDate.setDate(Math.floor(Math.random() * 25) + 1);
        const endFutureDate = new Date(futureDate);

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
          createdAt: new Date(),
          appliedOn: new Date()
        });
      }
    }

    // Safe Chunked Insertions to prevent connection timeouts/drops
    console.log(`Saving ${attendanceRecords.length} Attendance records in batches...`);
    await saveInBatches(Attendance, attendanceRecords, 50);

    console.log(`Saving ${leaveRecords.length} Leave records in batches...`);
    await saveInBatches(Leave, leaveRecords, 50);

    console.log(`Successfully seeded:`);
    console.log(`- ${employees.length} Employees`);
    console.log(`- ${attendanceRecords.length} Attendance Records (30 Days)`);
    console.log(`- ${leaveRecords.length} Leave Records`);

    // 7. Maintenance Phase (from seedEmployees logic)
    console.log('Running maintenance/normalization phase...');
    const allEmployees = await User.find({ role: 'employee' });
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
        await emp.save();
        updatedCount++;
      }
    }
    console.log(`Normalized ${updatedCount} existing employee records.`);

    // ==========================================
    // 8. Seed Notification Telemetry
    // ==========================================
    console.log('Seeding push notifications and recipient logs...');

    // Clear old manual notifications, logs, feeds
    await Promise.all([
      Notification.deleteMany({}),
      NotificationLog.deleteMany({}),
      EmployeeNotification.deleteMany({})
    ]);

    const seededAdmin = await User.findOne({ role: 'admin' });
    const seededEmployees = await User.find({ role: 'employee' });

    if (seededAdmin && seededEmployees.length > 0) {
      const campaigns = [
        {
          title: 'General HR Announcement: Q3 Strategy Meeting',
          description: 'All departments are requested to join the Q3 Townhall on Friday at 3:00 PM via Zoom. We will review geofence enhancements and designation quotas.',
          type: 'HR Announcement',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 5,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Critical Office Relocation Update',
          description: 'Please note that starting Monday, our main headquarters will shift to the new smart business park. Punch-in boundaries have been updated accordingly.',
          type: 'General Announcement',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 3,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Punch In Discrepancy Audit Alert',
          description: 'We have noticed multiple employees punching out late without registering active movement routes. Please ensure your mobile location services are set to Always Allow.',
          type: 'Attendance Alert',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 1,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Draft: Upcoming Team Bonding Event',
          description: 'A mock draft notification for the upcoming corporate sports meet. Scheduled to be sent next Monday.',
          type: 'Meeting Notification',
          frequency: 'Custom Schedule',
          targetType: 'All Employees',
          status: 'draft',
          daysAgo: 0,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Emergency Building Evacuation Drill',
          description: 'Critical: The annual fire safety drill is scheduled for this Wednesday at 10:00 AM. Please follow exit markers.',
          type: 'Emergency Alert',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 2,
          isAuto: false,
          autoType: null
        },
        // Automatic workflows covering all 6 trigger events
        {
          title: 'Late Coming Warning',
          description: 'System Alert: You have checked in late today. Please ensure timely arrivals to maintain shift efficiency.',
          type: 'Late Coming',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 4,
          isAuto: true,
          autoType: 'Employee late by 15 mins'
        },
        {
          title: 'Geofence Breach Notification',
          description: 'System Alert: Your physical device was detected punching outside the office perimeter.',
          type: 'Geofence Exited',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 2,
          isAuto: true,
          autoType: 'Employee outside geofence'
        },
        {
          title: 'Absenteeism Notice',
          description: 'System Alert: No punch-in was recorded for your scheduled shift today, and no approved leaves were found.',
          type: 'Attendance Alert',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 1,
          isAuto: true,
          autoType: 'Employee absent'
        },
        {
          title: 'Leave Application Approved',
          description: 'Congratulations! Your requested leave of absence has been reviewed and approved by the HR Manager.',
          type: 'Leave Approved',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 3,
          isAuto: true,
          autoType: 'Leave approved'
        },
        {
          title: 'Leave Application Submitted',
          description: 'Your leave application has been submitted successfully and is awaiting review.',
          type: 'Leave Applied',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 5,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Leave Application Rejected',
          description: 'Your requested leave of absence has been rejected. Please connect with your supervisor.',
          type: 'Leave Rejected',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 5,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Geofence Safe Zone Entered',
          description: 'Welcome to the Main HQ! Your device has entered the office coordinates safely.',
          type: 'Geofence Entered',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 6,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Shift Commencement Alert',
          description: 'Your morning shift is scheduled to begin in 15 minutes. Please locate your workstation and clock in.',
          type: 'Shift Reminder',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 4,
          isAuto: true,
          autoType: 'Shift starting reminder'
        },
        {
          title: 'Daily Punch In Reminder',
          description: 'Good morning! This is your daily reminder to punch in for work.',
          type: 'Punch In Reminder',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 7,
          isAuto: false,
          autoType: null
        },
        {
          title: 'Daily Punch Out Reminder',
          description: 'Shift completed! Don\'t forget to punch out to record your working hours correctly.',
          type: 'Punch Out Reminder',
          frequency: 'Instant',
          targetType: 'All Employees',
          status: 'sent',
          daysAgo: 1,
          isAuto: true,
          autoType: 'Punch out reminder'
        }
      ];

      const seededLogs = [];
      const seededFeeds = [];

      for (const camp of campaigns) {
        const sentTime = new Date();
        sentTime.setDate(sentTime.getDate() - camp.daysAgo);

        const notification = await Notification.create({
          title: camp.title,
          description: camp.description,
          type: camp.type,
          frequency: camp.frequency,
          targetType: camp.targetType,
          status: camp.status,
          createdBy: seededAdmin._id,
          isAuto: camp.isAuto,
          autoType: camp.autoType,
          createdAt: sentTime,
          updatedAt: sentTime
        });

        if (camp.status === 'sent') {
          seededEmployees.forEach((emp, index) => {
            const isRead = index % 3 !== 0;
            const isDelivered = index % 12 !== 0;

            let readTime = null;
            if (isRead && isDelivered) {
              readTime = new Date(sentTime.getTime());
              readTime.setMinutes(readTime.getMinutes() + 15 + (index * 7) % 105);
            }

            seededLogs.push({
              notificationId: notification._id,
              employeeId: emp._id,
              fcmToken: emp.fcmToken || `mock_fcm_token_index_${index}`,
              sentAt: sentTime,
              deliveredAt: isDelivered ? sentTime : null,
              isRead: isRead && isDelivered,
              readTime: readTime,
              deliveryStatus: isDelivered ? 'delivered' : 'failed',
              deviceType: index % 2 === 0 ? 'Mobile' : 'Web',
              errorMessage: isDelivered ? null : 'FCM service returned device unregistered'
            });

            seededFeeds.push({
              employeeId: emp._id,
              notificationId: notification._id,
              title: camp.title,
              body: camp.description,
              type: camp.type,
              isRead: isRead && isDelivered,
              readTime: readTime,
              createdAt: sentTime
            });
          });
        }
      }

      if (seededLogs.length > 0) {
        console.log(`Saving ${seededLogs.length} Notification Logs in batches...`);
        await saveInBatches(NotificationLog, seededLogs, 50);
      }

      if (seededFeeds.length > 0) {
        console.log(`Saving ${seededFeeds.length} In-App Feeds in batches...`);
        await saveInBatches(EmployeeNotification, seededFeeds, 50);
      }

      console.log(`- Seeded ${seededLogs.length} Notification Logs & In-App Feeds successfully!`);
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
