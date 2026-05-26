const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // serverSelectionTimeoutMS: 5000 enables quicker detection of offline database
    // socketTimeoutMS: 45000 sets inactivity timeout before closing socket
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error on start: ${error.message}`);
    process.exit(1);
  }

  // Setup connection event listeners to track connection state and automatic reconnections
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB connection disconnected! Attempting to reconnect automatically...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB connection reconnected successfully.');
  });

  mongoose.connection.on('error', (err) => {
    // Avoid printing massive ECONNRESET stacks if it is a simple socket drop
    if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
      console.warn('⚠️ MongoDB Connection reset (ECONNRESET) detected. Auto-reconnecting...');
    } else {
      console.error('❌ MongoDB connection error:', err.message || err);
    }
  });
};

module.exports = connectDB;
