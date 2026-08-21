const mongoose = require('mongoose');

const connectDB = async (retries = 5, delay = 2000) => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  const options = {
    serverSelectionTimeoutMS: 30000, // 30 seconds for cloud / cold-start lookups
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 50,
    minPoolSize: 2,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 30000,
    family: 4, // Force IPv4 to prevent Windows dual-stack IPv6 DNS lookup delays
    autoIndex: true,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Database] Connecting to MongoDB (Attempt ${attempt}/${retries})...`);
      const conn = await mongoose.connect(mongoUri, options);
      console.log(`✅ MongoDB Connected successfully: ${conn.connection.host} (${conn.connection.name})`);
      return conn;
    } catch (error) {
      console.error(`⚠️ MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt < retries) {
        console.log(`[Database] Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error('❌ All MongoDB connection attempts failed. Server will continue in degraded mode and retry in background.');
      }
    }
  }

  // Setup connection event listeners to track connection state and automatic reconnections
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected! Attempting to reconnect automatically...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB connection reconnected successfully.');
  });

  mongoose.connection.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
      console.warn('⚠️ MongoDB Connection reset (ECONNRESET) detected. Auto-reconnecting...');
    } else {
      console.error('❌ MongoDB connection error:', err.message || err);
    }
  });
};

module.exports = connectDB;
