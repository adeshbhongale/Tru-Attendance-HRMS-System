const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { RawTrackingPoint, LiveEmployeeStatus } = require('../models/Tracking');

async function run() {
  try {
    const mongoUri = process.env.MONGO_URI;
    await mongoose.connect(mongoUri);
    console.log('Database connected.');

    // Look up both possible user IDs
    const userIds = ['6a3653370f96ad459c754f91', '6a366605191b5d953bfab1cc'];

    for (const userId of userIds) {
      const user = await User.findById(userId);
      if (!user) continue;
      console.log(`\n============================================================`);
      console.log(`User: ${user.name} (${user.email}) | ID: ${user._id}`);
      
      const liveStatus = await LiveEmployeeStatus.findOne({ userId });
      if (liveStatus) {
        console.log(`Live Status Last Update: ${liveStatus.lastUpdate.toISOString()}`);
        console.log(`Live Status: ${liveStatus.currentStatus} | State: ${liveStatus.movementState}`);
      }

      // Fetch points from 4:00 PM onwards (in UTC: 10:30 AM onwards)
      const startTime = new Date();
      startTime.setUTCHours(10, 0, 0, 0); // 3:30 PM IST

      const points = await RawTrackingPoint.find({ 
        userId, 
        timestamp: { $gte: startTime } 
      }).sort({ timestamp: -1 });

      console.log(`Found ${points.length} points from 3:30 PM IST onwards.`);
      points.forEach((p, idx) => {
        // Format to IST local time for easy correlation with user's times
        const localTime = new Date(p.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });
        console.log(`${idx + 1}: Local Time: ${localTime} (UTC: ${p.timestamp.toISOString()})`);
        console.log(`   Raw:         [${p.rawLongitude}, ${p.rawLatitude}]`);
        console.log(`   Snapped:     [${p.snappedLongitude}, ${p.snappedLatitude}]`);
        console.log(`   Road Name:   "${p.roadName}" | Road ID: ${p.roadId}`);
        console.log(`   Speed:       ${(p.speed * 3.6).toFixed(1)} km/h | Status: ${p.status}`);
        console.log(`   Transition:  "${p.transitionReason}" | Provider: ${p.provider}`);
        console.log('------------------------------------------------------------');
      });
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
