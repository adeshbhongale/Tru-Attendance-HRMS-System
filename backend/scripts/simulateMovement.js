const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const io = require('socket.io-client');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const Attendance = require('../models/Attendance');
const User = require('../models/User');
const geoService = require('../services/geoTrackingService');

const IDENTIFIER = process.argv[2] || 'adesh@example.com';
const SOCKET_URL = process.env.SOCKET_URL;

const OFFICE_LAT = 16.701;
const OFFICE_LNG = 74.4496;

async function simulate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB for simulation...');

  // Try to find user by Email first, then by ID
  let user = await User.findOne({ email: IDENTIFIER });
  if (!user && mongoose.Types.ObjectId.isValid(IDENTIFIER)) {
    user = await User.findById(IDENTIFIER);
  }

  if (!user) {
    console.error(`User with email/id "${IDENTIFIER}" not found`);
    process.exit(1);
  }

  const USER_ID = user._id.toString();


  // Socket connection to broadcast
  const socket = io(SOCKET_URL);

  socket.on('connect', () => {
    console.log('Connected to Socket server');
  });

  // Ensure active attendance
  const todayStr = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(todayStr + "T00:00:00.000Z");
  const endOfDay = new Date(todayStr + "T23:59:59.999Z");

  let attendance = await Attendance.findOne({
    user: USER_ID,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  if (!attendance) {
    console.log('Creating punch-in record for simulation...');
    attendance = await Attendance.create({
      user: USER_ID,
      date: startOfDay,
      punchIn: {
        time: new Date(),
        location: { latitude: OFFICE_LAT, longitude: OFFICE_LNG, address: 'Office Gate' }
      },
      status: 'Present'
    });
  }

  console.log('Starting movement simulation for:', user.name);

  // Helper to update location
  const updateLocation = async (lat, lng, addr) => {
    const now = new Date();

    let lastPoint = null;
    if (attendance.trackingLogs.length > 0) {
      lastPoint = attendance.trackingLogs[attendance.trackingLogs.length - 1];
    } else {
      lastPoint = {
        latitude: attendance.punchIn.location.latitude,
        longitude: attendance.punchIn.location.longitude,
        time: attendance.punchIn.time
      };
    }

    const validation = geoService.validateLocation(lastPoint, { latitude: lat, longitude: lng, time: now });
    const dist = validation.distance;
    const totalDist = (attendance.totalDistance || 0) + dist;

    attendance.totalDistance = totalDist;
    attendance.trackingLogs.push({
      time: now,
      latitude: lat,
      longitude: lng,
      address: addr,
      distanceFromPrevious: dist,
      totalDistanceTillNow: totalDist
    });

    await attendance.save();
    console.log(`[SIM] At: ${addr} | Total Dist: ${totalDist.toFixed(3)} km`);

    // Broadcast
    socket.emit('updateLocation', {
      userId: USER_ID,
      userName: user.name,
      latitude: lat,
      longitude: lng,
      address: addr,
      time: now,
      totalDistance: totalDist
    });
  };

  // Phase 1: Small circular movement in office (5 points)
  console.log('--- Phase 1: Office Movement (5 points) ---');
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * 2 * Math.PI;
    const lat = OFFICE_LAT + (Math.cos(angle) * 0.0001);
    const lng = OFFICE_LNG + (Math.sin(angle) * 0.0001);
    await updateLocation(lat, lng, 'Office Desk Area');
    await new Promise(r => setTimeout(r, 1000));
  }

  // DENSE MOVEMENT (Exactly 50 points, 1-10m jumps)
  console.log('--- Phase 2: High Activity Tracking (50 points, 1-10m jumps) ---');
  
  let currentLat = OFFICE_LAT;
  let currentLng = OFFICE_LNG;

  for (let i = 0; i < 50; i++) {
    // Jump between 40m and 60m (to total 2-3 km over 50 points)
    const angle = Math.random() * Math.PI * 2;
    const distanceMeters = 40 + (Math.random() * 20);
    const jumpDeg = distanceMeters * 0.000009; // 1m is roughly 0.000009 deg

    
    currentLat += (jumpDeg * Math.cos(angle));
    currentLng += (jumpDeg * Math.sin(angle));

    await updateLocation(currentLat, currentLng, `Simulated Path Point ${i + 1}`);
    // Fast simulation
    await new Promise(r => setTimeout(r, 200)); 
  }

  // Update last tracked location specifically
  attendance.lastTrackedLocation = {
    latitude: currentLat,
    longitude: currentLng,
    address: 'Final Simulated Point',
    time: new Date()
  };
  await attendance.save();

  console.log('Simulation complete! Total points: 50');


  socket.disconnect();
  process.exit(0);
}

simulate().catch(err => {
  console.error(err);
  process.exit(1);
});
