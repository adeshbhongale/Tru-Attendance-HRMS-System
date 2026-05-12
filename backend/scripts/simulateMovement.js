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

  // Phase 2: DENSE MOVEMENT (20 points total)
  console.log('--- Phase 2: High Activity Tracking (20 points) ---');
  // Small, granular jumps: ~10m - 50m
  const jumps = [
    { lat: 0.0001, lng: 0.0001, addr: 'Starting Out' },
    { lat: 0.0002, lng: 0.0002, addr: 'Moving North' },
    { lat: 0.0003, lng: 0.0004, addr: 'Passing Park' },
    { lat: 0.0005, lng: 0.0006, addr: 'Main Street' },
    { lat: 0.0007, lng: 0.0008, addr: 'Near Station' },
    { lat: 0.0009, lng: 0.0010, addr: 'Market Area' },
    { lat: 0.0011, lng: 0.0012, addr: 'Client Zone A' },
    { lat: 0.0013, lng: 0.0014, addr: 'Client Office' },
    { lat: 0.0014, lng: 0.0015, addr: 'Meeting Room' },
    { lat: 0.0013, lng: 0.0014, addr: 'Lunch Break' },
    { lat: 0.0011, lng: 0.0012, addr: 'Heading Back' },
    { lat: 0.0009, lng: 0.0010, addr: 'Returning Path' },
    { lat: 0.0007, lng: 0.0008, addr: 'City Gate' },
    { lat: 0.0004, lng: 0.0005, addr: 'Approach HQ' },
    { lat: 0.0000, lng: 0.0000, addr: 'Office Gate' }
  ];

  let finalLat = OFFICE_LAT;
  let finalLng = OFFICE_LNG;

  for (const jump of jumps) {
    finalLat = OFFICE_LAT + jump.lat;
    finalLng = OFFICE_LNG + jump.lng;
    await updateLocation(finalLat, finalLng, jump.addr);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Update last tracked location specifically
  attendance.lastTrackedLocation = {
    latitude: finalLat,
    longitude: finalLng,
    address: 'Final Simulated Location',
    time: new Date()
  };
  await attendance.save();

  console.log('Simulation complete! Total points: 20');


  socket.disconnect();
  process.exit(0);
}

simulate().catch(err => {
  console.error(err);
  process.exit(1);
});
