const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { clearCloudinaryStorage } = require('../utils/cloudinary');

const resetDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database...');

    // Clear Cloudinary storage
    await clearCloudinaryStorage();

    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      // Skip system collections if any
      if (collectionName.startsWith('system.')) continue;
      
      await mongoose.connection.db.collection(collectionName).deleteMany({});
      console.log(`Cleared collection: ${collectionName}`);
    }

    console.log('Database and Cloudinary storage reset successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting database:', err.message);
    process.exit(1);
  }
};

resetDB();
