/**
 * Office Setup Notifications Seeder Script
 * 
 * Creates ONLY pure notification records in the 'notifications' collection
 * for the "Office Setup -> Notifications" page (/notifications).
 * 
 * Does NOT assign specific employee targets, logs, or mock data.
 * 
 * Usage:
 *   Local DB (from backend/.env):
 *     node scripts/seed_notifications_only.js
 * 
 *   Hosted Production DB (custom MongoDB URI):
 *     node scripts/seed_notifications_only.js "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>"
 * 
 *   Optional flags:
 *     --clear     Wipes existing notifications before creating
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend/.env if present
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const Notification = require('../models/Notification');
const Company = require('../models/Company');
const User = require('../models/User');

const args = process.argv.slice(2);
const shouldClear = args.includes('--clear');
const customUriArg = args.find(a => !a.startsWith('--'));
const MONGO_URI = customUriArg || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('\x1b[31m[Error] MONGO_URI not found. Please provide it as an argument or set MONGO_URI in .env file.\x1b[0m');
  console.log('Example: node scripts/seed_notifications_only.js "mongodb+srv://user:pass@cluster.mongodb.net/dbname"');
  process.exit(1);
}

const NOTIFICATIONS_TO_SEED = [
  {
    type: 'general notification',
    title: 'Office Relocation Phase Update',
    description: 'Please note that the corporate headquarters relocation project is proceeding. Detailed transition guidelines are available on the intranet.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: false,
    autoType: 'general',
  },
  {
    type: 'attendance notification',
    title: 'Absent Notification 🔴',
    description: 'You have been marked ABSENT for your shift. If this is a mistake, please contact HR immediately.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Employee absent',
  },
  {
    type: 'attendance notification',
    title: 'Late Arrival Warning ⏰',
    description: 'You checked in late today for your scheduled shift. Please maintain shift punctuality.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Employee late by grace time',
  },
  {
    type: 'general notification',
    title: 'Leave Request Approved! 🎉',
    description: 'Good news! Your leave request has been reviewed and approved by management.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Leave approved',
  },
  {
    type: 'tracing notification',
    title: 'Geofence Exit Alert 📍',
    description: 'You have exited the designated geofence boundary during shift hours. Please return to the workplace zone.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Employee outside geofence',
  },
  {
    type: 'attendance notification',
    title: 'Punch Out Reminder 🕒',
    description: 'Your shift is ending shortly. Please remember to clock out to record your working hours correctly.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Employee punch out reminder',
  },
  {
    type: 'general notification',
    title: 'Shift Schedule Updated 🚀',
    description: 'Your work shift schedule has been updated. Please verify your new timing in the app.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Shift change reminder',
  },
  {
    type: 'customer visit notification',
    title: 'New Customer Visit Assigned 💼',
    description: 'You have been assigned a new customer visit for client meeting and inspection.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Visit Assigned',
  },
  {
    type: 'customer visit notification',
    title: 'Customer Visit Completed ✅',
    description: 'Your customer visit report and check-out selfie have been recorded successfully.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: true,
    autoType: 'Visit Completed',
  },
  {
    type: 'hr announcement',
    title: 'Annual Company Performance Review 📋',
    description: 'The annual appraisal and performance review cycle is now active. Please submit your self-assessment.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: false,
    autoType: null,
  },
  {
    type: 'general notification',
    title: 'Quarterly Townhall Meeting Scheduled',
    description: 'All departments are invited to join the upcoming quarterly townhall meeting on company growth and roadmap.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: false,
    autoType: 'general',
  },
  {
    type: 'emergency notification',
    title: 'Building Safety & Evacuation Drill ⚠️',
    description: 'Critical Alert: A mandatory building evacuation and fire safety drill is scheduled for this Friday.',
    targetType: 'All Employees',
    frequency: 'Instant',
    status: 'draft',
    isAuto: false,
    autoType: null,
  }
];

async function createNotificationsOnly() {
  console.log('\n\x1b[36m=======================================================');
  console.log('       OFFICE SETUP NOTIFICATIONS CREATOR');
  console.log('=======================================================\x1b[0m\n');

  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}...`);
    await mongoose.connect(MONGO_URI);
    console.log('\x1b[32m[Database] Connected successfully!\x1b[0m\n');

    // 1. Fetch Company
    const company = await Company.findOne({});

    // 2. Fetch Creator Admin
    const creatorUser = await User.findOne({
      role: { $in: ['admin', 'superadmin', 'company_admin', 'companyadmin', 'hr', 'hr_admin'] }
    }) || await User.findOne({});

    const companyId = company?._id || creatorUser?.companyId || creatorUser?.company || null;
    const createdBy = creatorUser?._id || null;

    if (shouldClear) {
      console.log('Clearing existing notifications (--clear flag passed)...');
      await Notification.deleteMany({});
      console.log('\x1b[32mCleared existing notifications.\x1b[0m\n');
    }

    console.log(`Creating ${NOTIFICATIONS_TO_SEED.length} pure notification records...`);

    const docs = NOTIFICATIONS_TO_SEED.map(item => ({
      companyId,
      company: companyId,
      title: item.title,
      description: item.description,
      type: item.type,
      frequency: item.frequency || 'Instant',
      targetType: 'All Employees',
      employees: [],
      departments: [],
      status: item.status || 'draft',
      createdBy,
      isAuto: Boolean(item.isAuto),
      autoType: item.autoType || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const createdDocs = await Notification.insertMany(docs);

    console.log('\n\x1b[32m=======================================================');
    console.log('       NOTIFICATIONS CREATED SUCCESSFULLY! 🎉');
    console.log('=======================================================\x1b[0m');
    console.log(`- Created ${createdDocs.length} notification records.`);
    console.log('\nYou can now view, edit, and decide actions for these notifications in:');
    console.log('  Admin Panel -> Office Setup -> Notifications (/notifications)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n\x1b[31m[Error during creation]:\x1b[0m', error.message);
    process.exit(1);
  }
}

createNotificationsOnly();
