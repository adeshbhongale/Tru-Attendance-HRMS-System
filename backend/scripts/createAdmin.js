const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

const createAdmin = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('CRITICAL ERROR: MONGO_URI is not defined in your .env file.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    const superAdminData = {
      name: 'System Super Admin',
      email: 'superadmin@trucode.com',
      mobile: '9999999999',
      employeeIdCode: 'SUPER001',
      password: 'Admin@123',
      role: 'superadmin',
      roleCode: 'TCSA1',
      scope: 'GLOBAL',
      companyId: null,
      company: null,
      department: 'Management',
      designation: 'Super Administrator',
      status: 'ACTIVE',
    };

    let existing = await User.findOne({
      $or: [{ email: superAdminData.email }, { employeeIdCode: superAdminData.employeeIdCode }]
    });

    if (existing) {
      Object.assign(existing, superAdminData);
      await existing.save();
      console.log('✔ Super Admin updated successfully:', existing.email);
    } else {
      await User.create(superAdminData);
      console.log('✔ Super Admin created successfully:', superAdminData.email);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error creating super admin:', err.message);
    process.exit(1);
  }
};

createAdmin();
