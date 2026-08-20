require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function cleanup() {
  await mongoose.connect(process.env.MONGO_URI);
  const Attendance = require('../models/Attendance');
  const duplicates = await Attendance.aggregate([
    { $group: { _id: { user: '$user', date: '$date' }, count: { $sum: 1 }, docs: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  console.log('Duplicate groups found:', duplicates.length);
  for (const g of duplicates) {
    const toDelete = g.docs.slice(1);
    console.log('Deleting duplicate doc IDs:', toDelete);
    await Attendance.deleteMany({ _id: { $in: toDelete } });
  }
  console.log('Deduplication cleanup complete');
  process.exit(0);
}

cleanup().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
