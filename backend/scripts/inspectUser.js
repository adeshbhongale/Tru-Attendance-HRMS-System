const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { RawTrackingPoint } = require('../models/Tracking');

async function inspect() {
  try {
    const mongoUri = process.env.MONGO_URI;
    await mongoose.connect(mongoUri);
    console.log('DB Connected.');

    const user = await User.findOne({ email: 'adesh@example.com' });
    if (!user) {
      console.log('User adesh@example.com not found.');
      return;
    }

    console.log(`User: ${user.name} (${user._id}), Email: ${user.email}`);

    const count = await RawTrackingPoint.countDocuments({ userId: user._id });
    console.log(`Total raw points: ${count}`);

    const lastPoints = await RawTrackingPoint.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(20);

    console.log('Last 20 points:');
    lastPoints.forEach((p, idx) => {
      console.log(`${idx+1}: Time: ${p.timestamp.toISOString()}, Coordinates: ${p.location.coordinates}, snapped: [${p.snappedLongitude}, ${p.snappedLatitude}], roadId: ${p.roadId}, transitionReason: ${p.transitionReason}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

inspect();
