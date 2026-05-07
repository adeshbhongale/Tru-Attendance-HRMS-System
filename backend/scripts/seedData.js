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
      User.deleteMany({}),
      Shift.deleteMany({}),
      Location.deleteMany({}),
      Attendance.deleteMany({}),
      Leave.deleteMany({}),
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
    if (data.location) {
      const location = await Location.create(data.location);
      console.log(`Location created: ${location.name}`);
    }

    // Map shifts to users and create them
    if (data.users && data.users.length > 0) {
      const usersWithShifts = data.users.map(user => {
        const shift = createdShifts.find(s => s.name === (user.shift || 'General Shift'));
        return {
          ...user,
          shift: shift ? shift._id : null,
          password: 'password123' // Default password for all users
        };
      });

      const createdUsers = await User.create(usersWithShifts);
      console.log(`${createdUsers.length} Users created`);

      // Seed Attendance
      if (data.attendance && data.attendance.length > 0) {
        const attendanceData = data.attendance.map(att => {
          const user = createdUsers.find(u => u.email === att.userEmail);
          if (!user) return null;
          
          const { userEmail, ...attDetails } = att;
          
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
    }

    console.log('Database seeded successfully');
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err.message);
    process.exit(1);
  }
};

seedData();
