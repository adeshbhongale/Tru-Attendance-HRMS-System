const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const User = require('../models/User');
const Company = require('../models/Company');

dotenv.config({ path: path.join(__dirname, '../.env') });

const createAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;
    if (!mongoUri) {
      console.error('CRITICAL ERROR: MONGO_URI is not defined in your .env file.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 1. Find or create company TCSL
    let tcslCompany = await Company.findOne({
      $or: [{ code: 'TCSL' }, { companyCode: 'TCSL' }]
    });

    if (!tcslCompany) {
      tcslCompany = await Company.create({
        name: 'TruCode Coding Systems Limited',
        companyName: 'TruCode Coding Systems Limited',
        code: 'TCSL',
        companyCode: 'TCSL',
        legalName: 'TruCode Coding Systems Limited',
        status: 'ACTIVE',
      });
      console.log('✔ Company TCSL created successfully (ID:', tcslCompany._id.toString(), ')');
    } else {
      tcslCompany.status = 'ACTIVE';
      tcslCompany.companyCode = 'TCSL';
      tcslCompany.code = 'TCSL';
      tcslCompany.name = 'TruCode Coding Systems Limited';
      tcslCompany.companyName = 'TruCode Coding Systems Limited';
      await tcslCompany.save();
      console.log('✔ Company TCSL verified and active (ID:', tcslCompany._id.toString(), ')');
    }

    // 2. Create or update Super Admin (GLOBAL scope, not tied to or counted in any single company)
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
      department: 'Executive Management',
      designation: 'Super Administrator',
      status: 'ACTIVE',
    };

    let existingSuper = await User.findOne({
      $or: [{ email: superAdminData.email }, { employeeIdCode: superAdminData.employeeIdCode }]
    }).select('+password');

    if (existingSuper) {
      existingSuper.name = superAdminData.name;
      existingSuper.email = superAdminData.email;
      existingSuper.mobile = superAdminData.mobile;
      existingSuper.employeeIdCode = superAdminData.employeeIdCode;
      existingSuper.password = superAdminData.password;
      existingSuper.role = superAdminData.role;
      existingSuper.roleCode = superAdminData.roleCode;
      existingSuper.scope = 'GLOBAL';
      existingSuper.companyId = null;
      existingSuper.company = null;
      existingSuper.department = superAdminData.department;
      existingSuper.designation = superAdminData.designation;
      existingSuper.status = 'ACTIVE';
      await existingSuper.save();
      console.log('✔ Super Admin updated successfully (GLOBAL Scope, unlinked from individual companies):', existingSuper.email);
    } else {
      await User.create(superAdminData);
      console.log('✔ Super Admin created successfully (GLOBAL Scope, unlinked from individual companies):', superAdminData.email);
    }

    // 3. Create or update Company Admin for company TCSL
    const companyAdminData = {
      name: 'TCSL Company Admin',
      email: 'admin@trucode.com',
      mobile: '9888888888',
      employeeIdCode: 'TCSL001',
      password: 'Admin@123',
      role: 'company_admin',
      roleCode: 'TCCA1',
      scope: 'COMPANY',
      companyId: tcslCompany._id,
      company: tcslCompany._id,
      department: 'Management',
      designation: 'Company Administrator',
      status: 'ACTIVE',
    };

    let existingCompanyAdmin = await User.findOne({
      $or: [{ email: companyAdminData.email }, { employeeIdCode: companyAdminData.employeeIdCode }]
    }).select('+password');

    if (existingCompanyAdmin) {
      existingCompanyAdmin.name = companyAdminData.name;
      existingCompanyAdmin.email = companyAdminData.email;
      existingCompanyAdmin.mobile = companyAdminData.mobile;
      existingCompanyAdmin.employeeIdCode = companyAdminData.employeeIdCode;
      existingCompanyAdmin.password = companyAdminData.password;
      existingCompanyAdmin.role = companyAdminData.role;
      existingCompanyAdmin.roleCode = companyAdminData.roleCode;
      existingCompanyAdmin.scope = 'COMPANY';
      existingCompanyAdmin.companyId = tcslCompany._id;
      existingCompanyAdmin.company = tcslCompany._id;
      existingCompanyAdmin.department = companyAdminData.department;
      existingCompanyAdmin.designation = companyAdminData.designation;
      existingCompanyAdmin.status = 'ACTIVE';
      await existingCompanyAdmin.save();
      console.log('✔ Company Admin updated successfully for company TCSL:', existingCompanyAdmin.email);
    } else {
      await User.create(companyAdminData);
      console.log('✔ Company Admin created successfully for company TCSL:', companyAdminData.email);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Super Admin Credentials (Whole System):');
    console.log('   Company Code : (Leave blank or TCSL)');
    console.log('   Email        : superadmin@trucode.com');
    console.log('   Employee ID  : SUPER001');
    console.log('   Password     : Admin@123');
    console.log('   Scope        : GLOBAL (Not counted in any company)');
    console.log('────────────────────────────────────────────────────');
    console.log('🏢 Company Admin Credentials (TCSL):');
    console.log('   Company Code : TCSL');
    console.log('   Email        : admin@trucode.com');
    console.log('   Employee ID  : TCSL001');
    console.log('   Password     : Admin@123');
    console.log('   Scope        : COMPANY (TCSL)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (err) {
    console.error('Error creating admins:', err.message);
    process.exit(1);
  }
};

createAdmin();
