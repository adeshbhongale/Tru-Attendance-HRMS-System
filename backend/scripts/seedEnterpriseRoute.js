const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { RawTrackingPoint, LiveEmployeeStatus, TrackingSession } = require('../models/Tracking');
const enterpriseTrackingService = require('../services/enterpriseTrackingService');

async function seedData() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in environment variables');
    }

    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected to Database successfully!');

    // 1. Find or create a test employee
    let employee = await User.findOne({ role: 'employee' });
    if (!employee) {
      console.log('No employee found, creating a test employee...');
      employee = await User.create({
        name: 'Enterprise Tracking Employee',
        email: 'empl@example.com',
        mobile: '9876543210',
        password: 'password123',
        role: 'employee',
        department: 'Operations',
        designation: 'Field Agent',
        status: 'active'
      });
      console.log(`Created employee: ${employee.name} (${employee._id})`);
    } else {
      console.log(`Using existing employee: ${employee.name} (${employee._id})`);
    }

    const userId = employee._id;

    // 2. Set today's date and clean previous tracking data for this user for today
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    console.log('Cleaning existing tracking data for today...');
    await Attendance.deleteMany({ user: userId, date: { $gte: startOfDay, $lte: endOfDay } });
    await RawTrackingPoint.deleteMany({ userId: userId, timestamp: { $gte: startOfDay, $lte: endOfDay } });
    await LiveEmployeeStatus.deleteMany({ userId: userId });

    // 3. Create fresh punch-in attendance session
    const tripId = new mongoose.Types.ObjectId();
    const attendance = await Attendance.create({
      user: userId,
      date: startOfDay,
      status: 'Present',
      punchIn: {
        time: new Date(today.getTime() - 600000), // 10 mins ago
        location: {
          latitude: 16.7000,
          longitude: 74.4440,
          address: 'Main Gate, Ichalkaranji, MH, India'
        },
        isOutside: false
      },
      totalDistance: 0,
      distance: 0,
      trackingLogs: []
    });

    console.log(`Created Attendance session: ${attendance._id}`);

    // 4. Generate high-fidelity coordinates along a real roadway (running East along a road)
    // We will generate:
    // P1 to P3: Road A (Highway)
    // P4: parallel road drift (drifts 35m north, should be rejected and snapped back to Highway)
    // P5 to P7: U-turn maneuver (slows speed, confirm U-turn on P7)
    // P8: turns onto a village road (slow speed, accepted immediately)
    const baseTime = new Date(today.getTime() - 300000); // 5 mins ago
    const deviceId = 'seed_device_123';

    const simulatedPoints = [
      // P1: Starting on Highway (Eastbound)
      {
        latitude: 16.7001,
        longitude: 74.4441,
        heading: 90,
        speed: 12,
        timestamp: new Date(baseTime.getTime() + 10000),
        accuracy: 10,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P2: Continuing East on Highway
      {
        latitude: 16.7002,
        longitude: 74.4452,
        heading: 90,
        speed: 12,
        timestamp: new Date(baseTime.getTime() + 20000),
        accuracy: 10,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P3: Continuing East on Highway
      {
        latitude: 16.7003,
        longitude: 74.4463,
        heading: 90,
        speed: 12,
        timestamp: new Date(baseTime.getTime() + 30000),
        accuracy: 10,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P4: Parallel road drift (GPS jumps 35m North, speed is 12m/s, heading is still 90)
      // This should be filtered / rejected, snapped back to highway coordinates
      {
        latitude: 16.7007, // Jumped North
        longitude: 74.4474,
        heading: 90,
        speed: 12,
        timestamp: new Date(baseTime.getTime() + 40000),
        accuracy: 12,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P5: Back on Highway, slowing down for U-turn
      {
        latitude: 16.7005,
        longitude: 74.4485,
        heading: 140, // turning
        speed: 4, // slowed down
        timestamp: new Date(baseTime.getTime() + 50000),
        accuracy: 10,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P6: Continuing U-turn, heading Westbound
      {
        latitude: 16.7004,
        longitude: 74.4480,
        heading: 210, // turning
        speed: 3,
        timestamp: new Date(baseTime.getTime() + 60000),
        accuracy: 10,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P7: Westbound confirmed (consensuses achieved)
      {
        latitude: 16.7003,
        longitude: 74.4470,
        heading: 270, // West
        speed: 8,
        timestamp: new Date(baseTime.getTime() + 70000),
        accuracy: 8,
        deviceId,
        tripId: attendance._id.toString()
      },
      // P8: Turns onto a small village road heading North, slow speed
      {
        latitude: 16.7015, // turn north
        longitude: 74.4470,
        heading: 0, // North
        speed: 2.5, // Slow village speed
        timestamp: new Date(baseTime.getTime() + 80000),
        accuracy: 12,
        deviceId,
        tripId: attendance._id.toString()
      }
    ];

    console.log(`Processing simulated batch of ${simulatedPoints.length} points through pipeline...`);
    const result = await enterpriseTrackingService.processTrackingBatch(userId.toString(), simulatedPoints, null);

    console.log('Batch processing result:', result);

    // 5. Verify the snapped points in database
    const savedPoints = await RawTrackingPoint.find({ userId: userId, timestamp: { $gte: startOfDay, $lte: endOfDay } }).sort('timestamp');
    console.log(`\nVerification: Saved ${savedPoints.length} tracking points to MongoDB.`);

    savedPoints.forEach((p, idx) => {
      console.log(`Point ${idx + 1}:
        Time: ${p.timestamp.toLocaleTimeString()}
        Raw Coords: ${p.rawLatitude.toFixed(5)}, ${p.rawLongitude.toFixed(5)}
        Snapped Coords: ${p.snappedLatitude ? p.snappedLatitude.toFixed(5) : 'NULL'}, ${p.snappedLongitude ? p.snappedLongitude.toFixed(5) : 'NULL'}
        Road ID: ${p.roadId}
        Road Name: ${p.roadName}
        Direction: ${p.travelDirection}
        Transition Reason: ${p.transitionReason}
        Matched Confidence: ${p.matchedRoadConfidence}
      `);
    });

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    console.log('Waiting 3 seconds for background tasks to finish...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

seedData();
