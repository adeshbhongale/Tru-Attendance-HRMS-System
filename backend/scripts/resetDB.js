const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

const resetDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('CRITICAL ERROR: MONGO_URI is not defined in your .env file.');
      process.exit(1);
    }

    // Auto-retry DB call helper for connection resilience
    const safeDbCall = async (fn, label = 'DB Operation') => {
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
          }
          return await fn();
        } catch (err) {
          const isNetworkError =
            err.message.includes('ECONNRESET') ||
            err.message.includes('socket') ||
            err.name === 'MongooseServerSelectionError' ||
            err.message.includes('buffered') ||
            err.message.includes('connection') ||
            err.code === 'ECONNRESET';

          if (isNetworkError && i < retries - 1) {
            console.warn(`[Retry] ${label} failed (${err.message}). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
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
    console.log('Connected to database cleanly.');

    // 1. Clear Cloudinary Storage (if configured)
    try {
      const { clearCloudinaryStorage } = require('../config/cloudinary');
      console.log('Clearing Cloudinary media storage...');
      await clearCloudinaryStorage();
      console.log('✓ Cloudinary storage cleared.');
    } catch (cErr) {
      console.warn('Cloudinary storage clearing skipped/failed:', cErr.message);
    }

    // 2. Iterate and clear all collections & drop indexes
    console.log('Fetching database collections...');
    const collections = await safeDbCall(() => mongoose.connection.db.listCollections().toArray(), 'List Collections');
    let clearedCount = 0;

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      if (collectionName.startsWith('system.')) continue;

      const colRef = mongoose.connection.db.collection(collectionName);
      
      // Delete all documents
      const deleteResult = await safeDbCall(() => colRef.deleteMany({}), `Clear ${collectionName}`);
      
      // Drop index constraints to ensure clean re-seeding
      try {
        await colRef.dropIndexes();
      } catch (_) { }

      console.log(`  - Cleared ${collectionName}: ${deleteResult.deletedCount} documents deleted`);
      clearedCount++;
    }

    console.log('\n===========================================================');
    console.log(`  DATABASE RESET SUCCESSFUL: ${clearedCount} COLLECTIONS WIPED!`);
    console.log('===========================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error resetting database:', err);
    process.exit(1);
  }
};

resetDB();

