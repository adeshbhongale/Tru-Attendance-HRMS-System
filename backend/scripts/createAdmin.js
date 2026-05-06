const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (adminExists) {
      console.log('Admin already exists');
      process.exit();
    }

    await User.create({
      name: 'Super Admin',
      email: process.env.ADMIN_EMAIL,
      mobile: process.env.ADMIN_MOBILE || '0000000000',
      role: 'admin',
      department: 'Management'
    });

    console.log('Admin created successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createAdmin();
