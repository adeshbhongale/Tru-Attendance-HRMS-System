const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Employee = require('../models/Employee');
const Company = require('../models/Company');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');
const Shift = require('../models/Shift');
const LeaveType = require('../models/LeaveType');
const LeavePolicy = require('../models/LeavePolicy');
const LeavePolicyRule = require('../models/LeavePolicyRule');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const CompanySetting = require('../models/CompanySetting');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const RolePermission = require('../models/RolePermission');
const ExpensePolicy = require('../modules/hr/expense/models/ExpensePolicy');
const { ensureExpenseMasters } = require('../modules/hr/expense/services/seedExpenseMasters');

const DATA_FILE_PATH = path.join(__dirname, '../data/actual_company_seed_data.json');

const seedActualCompanyData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/geo-attendance';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to Database:', mongoose.connection.name);

    if (!fs.existsSync(DATA_FILE_PATH)) {
      throw new Error(`Data file not found at: ${DATA_FILE_PATH}`);
    }

    const seedData = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));

    console.log('\n========================================================');
    console.log('🚀 SEEDING ACTUAL COMPANY DATA & ROLES');
    console.log('========================================================\n');

    // 1. Company
    console.log('🏢 [1/12] Seeding Company...');
    let company = await Company.findOne({
      $or: [{ code: seedData.company.code }, { name: seedData.company.name }]
    });

    if (!company) {
      company = await Company.create({
        name: seedData.company.name,
        companyName: seedData.company.companyName,
        code: seedData.company.code,
        companyCode: seedData.company.companyCode,
        legalName: seedData.company.legalName,
        address: seedData.company.address || { country: 'India' },
        status: seedData.company.status || 'ACTIVE'
      });
      console.log(`  + Created Company: ${company.name} (${company.code})`);
    } else {
      company.name = seedData.company.name;
      company.companyName = seedData.company.companyName;
      company.code = seedData.company.code;
      company.companyCode = seedData.company.companyCode;
      company.legalName = seedData.company.legalName;
      company.status = seedData.company.status || 'ACTIVE';
      await company.save();
      console.log(`  ✓ Updated Company: ${company.name} (${company.code})`);
    }

    const companyId = company._id;

    // 2. Company Settings
    console.log('\n⚙️  [2/12] Seeding Company Settings...');
    let compSettings = await CompanySetting.findOne({ companyId });
    if (!compSettings) {
      compSettings = await CompanySetting.create({
        companyId,
        orgCode: seedData.companySettings.orgCode || 'TC',
        weeklyOffs: seedData.companySettings.weeklyOffs || ['Sunday'],
        officeLocation: seedData.companySettings.officeLocation || { radius: 200, geofenceEnabled: true },
        roleGrades: seedData.companySettings.roleGrades || [
          { grade: 'a', name: 'Grade A' },
          { grade: 'b', name: 'Grade B' },
          { grade: 'c', name: 'Grade C' }
        ],
        androidApkUrl: seedData.companySettings.androidApkUrl || '',
        iosAppUrl: seedData.companySettings.iosAppUrl || ''
      });
      console.log('  + Created Company Settings');
    } else {
      compSettings.orgCode = seedData.companySettings.orgCode || 'TC';
      compSettings.weeklyOffs = seedData.companySettings.weeklyOffs || ['Sunday'];
      compSettings.officeLocation = seedData.companySettings.officeLocation || { radius: 200, geofenceEnabled: true };
      compSettings.androidApkUrl = seedData.companySettings.androidApkUrl || compSettings.androidApkUrl;
      compSettings.iosAppUrl = seedData.companySettings.iosAppUrl || compSettings.iosAppUrl;
      await compSettings.save();
      console.log('  ✓ Updated Company Settings');
    }

    // 3. Corporate Levels
    console.log('\n🏆 [3/12] Seeding Corporate Levels (L-1 to L-8)...');
    const levelMap = {};
    for (const lvl of seedData.levels) {
      let levelDoc = await Level.findOne({ companyId, levelNumber: lvl.levelNumber });
      if (!levelDoc) {
        levelDoc = await Level.create({
          companyId,
          company: companyId,
          levelNumber: lvl.levelNumber,
          name: lvl.name,
          category: lvl.category,
          categoryPrefix: lvl.categoryPrefix || null,
          usesDepartmentPrefix: lvl.usesDepartmentPrefix,
          defaultDataScope: lvl.defaultDataScope || 'SELF',
          canApprove: lvl.canApprove,
          status: lvl.status || 'active'
        });
      } else {
        levelDoc.name = lvl.name;
        levelDoc.category = lvl.category;
        levelDoc.categoryPrefix = lvl.categoryPrefix || null;
        levelDoc.usesDepartmentPrefix = lvl.usesDepartmentPrefix;
        levelDoc.defaultDataScope = lvl.defaultDataScope || 'SELF';
        levelDoc.canApprove = lvl.canApprove;
        levelDoc.status = lvl.status || 'active';
        await levelDoc.save();
      }
      levelMap[lvl.levelNumber] = levelDoc;
    }
    console.log(`  ✓ Seeded ${Object.keys(levelMap).length} Corporate Levels`);

    // 4. Grades
    console.log('\n🎓 [4/12] Seeding Grade Masters...');
    const gradeMap = {};
    for (const grd of seedData.grades) {
      let gradeDoc = await Grade.findOne({ companyId, code: grd.code.toLowerCase() });
      if (!gradeDoc) {
        gradeDoc = await Grade.create({
          companyId,
          company: companyId,
          code: grd.code.toLowerCase(),
          name: grd.name,
          gradeLabel: grd.gradeLabel || grd.name.replace('Grade ', ''),
          order: grd.order || grd.gradeOrder || 1,
          gradeOrder: grd.gradeOrder || grd.order || 1,
          salaryMultiplier: grd.salaryMultiplier || 1,
          status: grd.status || 'active'
        });
      } else {
        gradeDoc.name = grd.name;
        gradeDoc.gradeLabel = grd.gradeLabel || grd.name.replace('Grade ', '');
        gradeDoc.order = grd.order || grd.gradeOrder || 1;
        gradeDoc.gradeOrder = grd.gradeOrder || grd.order || 1;
        gradeDoc.salaryMultiplier = grd.salaryMultiplier || 1;
        gradeDoc.status = grd.status || 'active';
        await gradeDoc.save();
      }
      gradeMap[grd.code.toLowerCase()] = gradeDoc;
    }
    console.log(`  ✓ Seeded ${Object.keys(gradeMap).length} Grade Masters`);

    // 5. Departments
    console.log('\n📂 [5/12] Seeding Departments...');
    const deptMap = {};
    for (const d of seedData.departments) {
      let deptDoc = await Department.findOne({ companyId, name: d.name });
      if (!deptDoc) {
        deptDoc = await Department.create({
          companyId,
          name: d.name,
          prefix: d.prefix,
          description: d.description || '',
          status: d.status || 'active'
        });
      } else {
        deptDoc.prefix = d.prefix;
        deptDoc.description = d.description || deptDoc.description;
        deptDoc.status = d.status || 'active';
        await deptDoc.save();
      }
      deptMap[d.name] = deptDoc;
    }
    console.log(`  ✓ Seeded ${Object.keys(deptMap).length} Departments`);

    // 6. Designations
    console.log('\n💼 [6/12] Seeding Designations...');
    const desigMap = {};
    for (const desig of seedData.designations) {
      let desigDoc = await Designation.findOne({ companyId, name: desig.name });
      if (!desigDoc) {
        desigDoc = await Designation.create({
          companyId,
          name: desig.name,
          description: desig.description || '',
          status: desig.status || 'active'
        });
      } else {
        desigDoc.description = desig.description || desigDoc.description;
        desigDoc.status = desig.status || 'active';
        await desigDoc.save();
      }
      desigMap[desig.name] = desigDoc;
    }
    console.log(`  ✓ Seeded ${Object.keys(desigMap).length} Designations`);

    // 7. Locations / Working Places
    console.log('\n📍 [7/12] Seeding Locations & Geofences...');
    const locMap = {};
    for (const loc of seedData.locations) {
      let locDoc = await Location.findOne({ companyId, name: loc.name });
      if (!locDoc) {
        locDoc = await Location.create({
          companyId,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius: loc.radius || 50,
          address: loc.address || '',
          geofenceEnabled: loc.geofenceEnabled !== false
        });
      } else {
        locDoc.latitude = loc.latitude;
        locDoc.longitude = loc.longitude;
        locDoc.radius = loc.radius || 50;
        locDoc.address = loc.address || locDoc.address;
        locDoc.geofenceEnabled = loc.geofenceEnabled !== false;
        await locDoc.save();
      }
      locMap[loc.name] = locDoc;
    }
    console.log(`  ✓ Seeded ${Object.keys(locMap).length} Locations`);

    // 8. Shifts
    console.log('\n⏰ [8/12] Seeding Shifts...');
    let defaultShift = null;
    for (const s of seedData.shifts) {
      let shiftDoc = await Shift.findOne({ companyId, name: s.name });
      if (!shiftDoc) {
        shiftDoc = await Shift.create({
          companyId,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          gracePeriod: s.gracePeriod,
          halfDayAfter: s.halfDayAfter,
          workingHours: s.workingHours,
          weeklyOff: s.weeklyOff,
          status: s.status || 'active'
        });
      } else {
        shiftDoc.startTime = s.startTime;
        shiftDoc.endTime = s.endTime;
        shiftDoc.gracePeriod = s.gracePeriod;
        shiftDoc.halfDayAfter = s.halfDayAfter;
        shiftDoc.workingHours = s.workingHours;
        shiftDoc.weeklyOff = s.weeklyOff;
        shiftDoc.status = s.status || 'active';
        await shiftDoc.save();
      }
      if (!defaultShift) defaultShift = shiftDoc;
    }
    console.log('  ✓ Seeded Shifts');

    // 9. Leave Types & Policies
    console.log('\n🏖️  [9/12] Seeding Leave Types & Policies...');
    const leaveTypeMap = {};
    for (const lt of seedData.leaveTypes) {
      let ltDoc = await LeaveType.findOne({ companyId, code: lt.code });
      if (!ltDoc) {
        ltDoc = await LeaveType.create({
          companyId,
          name: lt.name,
          code: lt.code,
          limit: lt.limit,
          limitType: lt.limitType,
          genderRestriction: lt.genderRestriction,
          allowedDurations: lt.allowedDurations,
          allowFullDay: lt.allowFullDay,
          allowHalfDay: lt.allowHalfDay,
          allowMultipleDays: lt.allowMultipleDays,
          status: lt.status || 'active'
        });
      } else {
        ltDoc.name = lt.name;
        ltDoc.limit = lt.limit;
        ltDoc.limitType = lt.limitType;
        ltDoc.genderRestriction = lt.genderRestriction;
        ltDoc.allowedDurations = lt.allowedDurations;
        ltDoc.status = lt.status || 'active';
        await ltDoc.save();
      }
      leaveTypeMap[lt.code] = ltDoc;
    }

    for (const lp of seedData.leavePolicies) {
      const ltRef = leaveTypeMap[lp.leaveTypeCode] || leaveTypeMap['UPL'];
      if (!ltRef) continue;
      let policyDoc = await LeavePolicy.findOne({ companyId, name: lp.name });
      if (!policyDoc) {
        policyDoc = await LeavePolicy.create({
          companyId,
          leaveTypeRef: ltRef._id,
          name: lp.name,
          periodType: lp.periodType || 'YEARLY',
          carryForward: lp.carryForward || false,
          maxCarryForward: lp.maxCarryForward || 0,
          prorateNewJoiner: lp.prorateNewJoiner !== false,
          status: 'active'
        });
      }

      if (lp.rules && lp.rules.length > 0) {
        for (const r of lp.rules) {
          await LeavePolicyRule.findOneAndUpdate(
            { companyId, policyId: policyDoc._id, scopeCode: r.scopeCode || '_DEFAULT' },
            {
              companyId,
              policyId: policyDoc._id,
              scopeType: r.scopeType || 'company',
              scopeCode: r.scopeCode || '_DEFAULT',
              days: r.days
            },
            { upsert: true, new: true }
          );
        }
      }
    }
    console.log(`  ✓ Seeded ${seedData.leaveTypes.length} Leave Types & Policies`);

    // 10. Role Permissions & Approval Workflows
    console.log('\n🔒 [10/12] Seeding Role Permissions & Approval Workflows...');
    for (const p of seedData.rolePermissions) {
      await RolePermission.findOneAndUpdate(
        { permissionKey: p.permissionKey },
        {
          permissionKey: p.permissionKey,
          category: p.category,
          description: p.description,
          usedIn: p.usedIn,
          usagePurpose: p.usagePurpose,
          allowedRoles: p.allowedRoles,
          allowedCategories: p.allowedCategories || [],
          allowedRoleCodes: p.allowedRoleCodes || [],
          minLevelNumber: p.minLevelNumber || null,
          status: p.status || 'active'
        },
        { upsert: true, new: true }
      );
    }
    console.log(`  ✓ Seeded ${seedData.rolePermissions.length} Role Permissions`);

    for (const wf of seedData.approvalWorkflows) {
      await ApprovalWorkflow.findOneAndUpdate(
        { name: wf.name },
        {
          name: wf.name,
          module: wf.module,
          priorityOrder: wf.priorityOrder,
          status: wf.status || 'active',
          steps: wf.steps
        },
        { upsert: true, new: true }
      );
    }
    console.log(`  ✓ Seeded ${seedData.approvalWorkflows.length} Approval Workflows`);

    // 11. Expense Masters
    console.log('\n💰 [11/12] Ensuring Expense Masters & Entitlements...');
    await ensureExpenseMasters(companyId);
    // Guarantee only 1 unique active ExpensePolicy remains (remove duplicate policies)
    const existingPolicies = await ExpensePolicy.find({ companyId }).sort({ createdAt: 1 });
    if (existingPolicies.length > 1) {
      const keepPolicyId = existingPolicies[0]._id;
      await ExpensePolicy.deleteMany({ companyId, _id: { $ne: keepPolicyId } });
    }
    console.log('  ✓ Expense Masters seeded successfully (1 single active policy maintained)');

    // 12. Users & Reporting Structure (2-Phase Seeding)
    console.log(`\n👥 [12/12] Seeding All ${seedData.users.length} Users with Roles & Hierarchy...`);
    const defaultGrade = gradeMap['a'] || Object.values(gradeMap)[0];
    const defaultLocation = locMap['Malhar Height'] || Object.values(locMap)[0];

    const seededUsersByEmail = {};
    let createdCount = 0;
    let updatedCount = 0;

    // Phase 1: Create or Update User Records
    for (const u of seedData.users) {
      const cleanEmail = u.email.trim().toLowerCase();
      const cleanMobile = u.mobile.trim();
      const employeeIdCode = u.employeeIdCode.trim();

      const targetDept = deptMap[u.department] || deptMap['Office'];
      const targetLoc = locMap[u.workingPlace] || defaultLocation;
      const targetLevel = u.roleLevel ? (levelMap[u.roleLevel] || levelMap[6]) : null;
      const targetGrade = u.roleGrade ? (gradeMap[u.roleGrade.toLowerCase()] || defaultGrade) : null;

      const isSuperAdmin = u.role === 'superadmin' || cleanEmail.includes('superadmin');

      const userData = {
        companyId: isSuperAdmin ? null : companyId,
        company: isSuperAdmin ? null : companyId,
        companyCode: isSuperAdmin ? null : 'TCSL',
        name: u.name.trim(),
        email: cleanEmail,
        mobile: cleanMobile,
        employeeIdCode: employeeIdCode,
        password: 'password@123',
        department: targetDept ? targetDept.name : u.department,
        designation: u.designation.trim(),
        workingPlace: targetLoc ? targetLoc._id : null,
        shift: defaultShift ? defaultShift._id : null,
        gender: u.gender || 'Male',
        role: u.role,
        roleLevel: u.roleLevel || null,
        roleGrade: u.roleGrade || null,
        roleCode: u.roleCode || null,
        levelRef: targetLevel ? targetLevel._id : null,
        gradeRef: targetGrade ? targetGrade._id : null,
        dataScope: targetLevel ? targetLevel.defaultDataScope : (u.dataScope || 'SELF'),
        scope: isSuperAdmin ? 'GLOBAL' : (u.scope || 'COMPANY'),
        status: (u.status || 'ACTIVE').toUpperCase(),
        joiningDate: new Date('2024-01-01')
      };

      let existingUser = await User.findOne({
        $or: [
          { email: cleanEmail },
          { mobile: cleanMobile },
          { employeeIdCode: employeeIdCode }
        ]
      }).select('+password');

      if (existingUser) {
        existingUser.name = userData.name;
        existingUser.email = userData.email;
        existingUser.mobile = userData.mobile;
        existingUser.employeeIdCode = userData.employeeIdCode;
        if (!existingUser.password) existingUser.password = userData.password;
        existingUser.department = userData.department;
        existingUser.designation = userData.designation;
        existingUser.workingPlace = userData.workingPlace;
        existingUser.shift = userData.shift;
        existingUser.gender = userData.gender;
        existingUser.role = userData.role;
        existingUser.roleLevel = userData.roleLevel;
        existingUser.roleGrade = userData.roleGrade;
        existingUser.roleCode = userData.roleCode;
        existingUser.levelRef = userData.levelRef;
        existingUser.gradeRef = userData.gradeRef;
        existingUser.dataScope = userData.dataScope;
        existingUser.scope = userData.scope;
        existingUser.status = userData.status;
        existingUser.companyId = userData.companyId;
        existingUser.company = userData.company;
        existingUser.companyCode = userData.companyCode;

        await existingUser.save();
        seededUsersByEmail[cleanEmail] = existingUser;
        updatedCount++;
      } else {
        const newUser = await User.create(userData);
        seededUsersByEmail[cleanEmail] = newUser;
        createdCount++;
      }
    }

    // Phase 2: Establish ReportsTo Hierarchy & Sync Employee Profiles
    console.log('\n🔗 Linking Reporting Managers & Employee Profiles...');
    let linkedCount = 0;
    for (const u of seedData.users) {
      const cleanEmail = u.email.trim().toLowerCase();
      const currentUser = seededUsersByEmail[cleanEmail];
      if (!currentUser) continue;

      if (u.reportsToEmail) {
        const mgrUser = seededUsersByEmail[u.reportsToEmail.trim().toLowerCase()];
        if (mgrUser) {
          currentUser.reportsTo = mgrUser._id;
          await currentUser.save();
          linkedCount++;
        }
      }

      // Sync Employee Collection Record
      if (currentUser.role !== 'superadmin') {
        const targetDept = deptMap[u.department];
        const targetDesig = desigMap[u.designation];

        await Employee.findOneAndUpdate(
          { companyId, userId: currentUser._id },
          {
            companyId,
            employeeId: currentUser.employeeIdCode || `EMP${String(currentUser._id).slice(-4)}`,
            userId: currentUser._id,
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.mobile,
            departmentId: targetDept ? targetDept._id : null,
            designationId: targetDesig ? targetDesig._id : null,
            roleCode: currentUser.roleCode,
            gradeLevel: currentUser.roleLevel,
            status: 'ACTIVE'
          },
          { upsert: true, new: true }
        );
      }
    }

    console.log(`  ✓ Linked ${linkedCount} reporting manager relationships`);
    console.log(`  ✓ Synced employee profile records`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY:');
    console.log(`   🏢 Company           : ${company.name} (${company.code})`);
    console.log(`   🏆 Corporate Levels  : ${Object.keys(levelMap).length} (L-1 to L-8)`);
    console.log(`   🎓 Grade Masters     : ${Object.keys(gradeMap).length} (Grade A, B, C)`);
    console.log(`   📂 Departments       : ${Object.keys(deptMap).length}`);
    console.log(`   💼 Designations      : ${Object.keys(desigMap).length}`);
    console.log(`   📍 Locations         : ${Object.keys(locMap).length}`);
    console.log(`   🏖️  Leave Types       : ${Object.keys(leaveTypeMap).length}`);
    console.log(`   🔒 Role Permissions  : ${seedData.rolePermissions.length}`);
    console.log(`   👥 Total Users       : ${seedData.users.length} (Created: ${createdCount}, Updated: ${updatedCount})`);
    console.log(`   🔑 Default Password  : password@123`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err);
    process.exit(1);
  }
};

seedActualCompanyData();
