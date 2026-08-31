const User = require('../models/User');
const AttendanceModel = require('../models/Attendance');
const ErrorResponse = require('../utils/errorResponse');
const { uploadProfileImage } = require('../config/cloudinary');
const { getISTDateComponents, createDateFromIST, getStartOfDayIST, getEndOfDayIST, matchShift } = require('../utils/timezone');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, mobile, role } = req.body;

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      mobile,
      role,
    });

    await sendTokenResponse(user, 201, res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};



// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { companyCode, identifier, password, employeeId, email, username } = req.body;
    const inputIdentifier = identifier || employeeId || email || username;

    if (!inputIdentifier) {
      return res.status(400).json({ success: false, message: 'Please provide Employee ID, Email, or Mobile' });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Please provide a password' });
    }

    const Company = require('../models/Company');
    const trimmedIdentifier = inputIdentifier.trim();
    const cleanCompanyCode = companyCode ? companyCode.trim().toUpperCase() : null;

    const isMobileClient = req.body.clientType === 'mobile' || req.body.isMobile || (req.headers['x-client-type'] || '').toLowerCase() === 'mobile';

    let targetCompany = null;
    let user = null;

    // 1. Check if the identifier matches a GLOBAL Super Admin (no company code required)
    if (!isMobileClient) {
      const superAdminCandidate = await User.findOne({
        $or: [
          { scope: 'GLOBAL', email: trimmedIdentifier.toLowerCase() },
          { scope: 'GLOBAL', employeeIdCode: trimmedIdentifier.toUpperCase() },
          { role: { $in: ['superadmin', 'super_admin'] }, email: trimmedIdentifier.toLowerCase() },
          { role: { $in: ['superadmin', 'super_admin'] }, employeeIdCode: trimmedIdentifier.toUpperCase() },
          { roleCode: { $in: ['TCSA1', 'SUPERADMIN', 'SUPER_ADMIN'] }, email: trimmedIdentifier.toLowerCase() },
          { roleCode: { $in: ['TCSA1', 'SUPERADMIN', 'SUPER_ADMIN'] }, employeeIdCode: trimmedIdentifier.toUpperCase() }
        ]
      }).select('+password');

      if (superAdminCandidate) {
        user = superAdminCandidate;
      }
    }

    // 2. If not Super Admin and Company Code is provided, find company and company-scoped user
    if (!user && cleanCompanyCode) {
      targetCompany = await Company.findOne({
        $or: [
          { companyCode: cleanCompanyCode },
          { code: cleanCompanyCode }
        ]
      });

      if (!targetCompany) {
        return res.status(401).json({ success: false, message: `Company code '${cleanCompanyCode}' not found.` });
      }

      if (targetCompany.status === 'SUSPENDED' || targetCompany.status === 'INACTIVE' || targetCompany.status === 'inactive') {
        return res.status(403).json({ success: false, message: `Company '${targetCompany.companyName || targetCompany.name}' is currently inactive or suspended.` });
      }

      if (isMobileClient) {
        user = await User.findOne({
          companyId: targetCompany._id,
          mobile: trimmedIdentifier
        }).select('+password');
      } else {
        user = await User.findOne({
          $or: [
            { companyId: targetCompany._id, employeeIdCode: trimmedIdentifier.toUpperCase() },
            { companyId: targetCompany._id, employeeId: trimmedIdentifier.toUpperCase() },
            { companyId: targetCompany._id, email: trimmedIdentifier.toLowerCase() },
            { companyId: targetCompany._id, mobile: trimmedIdentifier }
          ]
        }).select('+password');
      }
    } else if (!user) {
      // 3. If no company code provided and not already resolved, find user
      if (isMobileClient) {
        user = await User.findOne({
          mobile: trimmedIdentifier
        }).select('+password');
      } else {
        user = await User.findOne({
          $or: [
            { email: trimmedIdentifier.toLowerCase() },
            { mobile: trimmedIdentifier },
            { employeeIdCode: trimmedIdentifier.toUpperCase() },
            { employeeId: trimmedIdentifier.toUpperCase() }
          ]
        }).select('+password');
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: cleanCompanyCode
          ? (isMobileClient
            ? `Invalid credentials for Company ${cleanCompanyCode}. Please check mobile number and password.`
            : `Invalid credentials for Company ${cleanCompanyCode}. Please check Employee ID/Email and password.`)
          : `Invalid credentials. User not found with '${trimmedIdentifier}'.`
      });
    }

    const statusUpper = (user.status || '').toUpperCase();
    if (statusUpper === 'DISABLED' || statusUpper === 'TERMINATED' || statusUpper === 'SUSPENDED' || statusUpper === 'LOCKED') {
      return res.status(401).json({ success: false, message: `Account status is ${statusUpper}. Access denied.` });
    }

    if (!user.password) {
      return res.status(401).json({ success: false, message: 'Password not set for this account. Please contact admin.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      return res.status(401).json({ success: false, message: 'Invalid credentials. Please check password.' });
    }

    // Mobile client login restriction — dynamic check from MobileAppConfig + hardcoded fallback
    if (isMobileClient) {
      const uRole = (user.role || '').toLowerCase();
      const uRoleCode = (user.roleCode || '').toUpperCase();

      // Always block GLOBAL superadmin from mobile
      if (uRole === 'superadmin' || uRole === 'super_admin' || uRoleCode === 'TCSA1' || user.scope === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Super Admin accounts cannot log in to the mobile app.'
        });
      }

      // Dynamic login control from MobileAppConfig
      try {
        const MobileAppConfig = require('../models/MobileAppConfig');
        const Level = require('../models/Level');
        const effectiveCompId = targetCompany?._id || user.companyId || user.company;
        if (effectiveCompId) {
          const mobileConfig = await MobileAppConfig.findOne({ companyId: effectiveCompId });
          if (mobileConfig && mobileConfig.loginControl) {
            const lc = mobileConfig.loginControl;
            let blocked = false;

            // Check blocked roles
            if (lc.blockedRoles && lc.blockedRoles.length > 0) {
              if (lc.blockedRoles.map(r => r.toLowerCase()).includes(uRole)) blocked = true;
            }
            // Check blocked role codes
            if (!blocked && lc.blockedRoleCodes && lc.blockedRoleCodes.length > 0) {
              if (lc.blockedRoleCodes.map(r => r.toUpperCase()).includes(uRoleCode)) blocked = true;
            }
            // Check blocked categories
            if (!blocked && lc.blockedCategories && lc.blockedCategories.length > 0) {
              let userCategory = null;
              if (user.levelRef) {
                const lvl = typeof user.levelRef === 'object' ? user.levelRef : await Level.findById(user.levelRef);
                userCategory = lvl?.category;
              }
              if (userCategory && lc.blockedCategories.includes(userCategory.toUpperCase())) blocked = true;
            }
            // Check blocked levels
            if (!blocked && lc.blockedLevels && lc.blockedLevels.length > 0) {
              const userLevelNum = user.roleLevel || null;
              if (userLevelNum != null && lc.blockedLevels.includes(userLevelNum)) blocked = true;
            }
            // Check blocked specific employees
            if (!blocked && lc.blockedEmployees && lc.blockedEmployees.length > 0) {
              const userId = user._id.toString();
              if (lc.blockedEmployees.map(id => id.toString()).includes(userId)) blocked = true;
            }

            if (blocked) {
              return res.status(403).json({
                success: false,
                message: 'Access denied. Your account is not permitted to log in to the mobile app. Contact your administrator.'
              });
            }
          }
        }
      } catch (configErr) {
        console.warn('[Auth] MobileAppConfig login check failed (non-blocking):', configErr.message);
      }
    }

    // Reset failed login attempts & update last login
    user.failedLoginAttempts = 0;
    user.lastLoginAt = new Date();
    if (req.body.deviceId) {
      user.lastActiveDevice = req.body.deviceId;
    }
    await user.save({ validateBeforeSave: false });

    return await sendTokenResponse(user, 200, res, req.body.deviceId, targetCompany);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  if (req.user) {
    // try {
    //   const user = await User.findById(req.user.id);
    //   if (user) {
    //     const io = req.app.get('io');
    //     const notificationService = require('../services/notificationService');
    //     await notificationService.createAndSendNotification({
    //       title: 'User Logout Alert 🚪',
    //       description: `User ${user.name} (${user.email || user.employeeIdCode || 'Staff'}) has logged out of the mobile application.`,
    //       type: 'general notification',
    //       frequency: 'Instant',
    //       targetType: 'Role-based Employees',
    //       targetRole: 'admin',
    //       companyId: user.companyId || req.tenant?.companyId || null,
    //       isAuto: false
    //     }, io);
    //   }
    // } catch (err) {
    //   console.error('[Logout Alert] Failed to send admin notification:', err.message);
    // }

    await User.findByIdAndUpdate(req.user.id, {
      isOnline: false,
      lastActiveDevice: null
    });
  }

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    data: {},
  });
};

// @desc    Get current logged in user
// @route   POST /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('shift');

  // --- Self-Healing Logic for Shift Changes ---
  // If user was marked 'Absent' today, but admin changed the shift and the NEW window is still open,
  // we remove the 'Absent' record to allow the user a fresh start.

  const now = new Date();
  const todayStart = getStartOfDayIST(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const absentRecord = await AttendanceModel.findOne({
    user: req.user.id,
    status: 'Absent',
    date: { $gte: todayStart, $lt: todayEnd }
  });

  if (absentRecord && user.shift) {
    // Calculate current shift cutoff
    const [sHour] = user.shift.startTime.split(':').map(Number);
    let cutoffStr = user.shift.punchInCutoff;
    if (!cutoffStr) {
      if (sHour < 12) cutoffStr = "14:00";
      else if (sHour < 20) cutoffStr = "22:00";
      else cutoffStr = "06:00";
    }
    const [cHour, cMin] = cutoffStr.split(':').map(Number);
    const nowIST = getISTDateComponents(now);
    let cutoffTime = createDateFromIST(nowIST.year, nowIST.month, nowIST.date, cHour, cMin);
    if (cHour < 12 && nowIST.hour > 12) {
      cutoffTime = createDateFromIST(nowIST.year, nowIST.month, nowIST.date + 1, cHour, cMin);
    }

    // If we are still within the valid window for the NEW shift, delete the old absence
    if (now <= cutoffTime) {
      await AttendanceModel.deleteOne({ _id: absentRecord._id });
    }
  }
  // --- Auto-close unclosed prior day attendance sessions ---
  try {
    const autoPunchOutService = require('../services/autoPunchOutService');
    await autoPunchOutService.closePriorDayAttendances(req.user.id, req.tenant?.companyId);
  } catch (e) {
    console.error('Auto-closure check in getMe failed:', e.message);
  }

  // 1. Resolve current shift window date
  let targetShiftDate = todayStart;
  if (user.shift) {
    const isNewEmployee = (now - new Date(user.createdAt)) < (48 * 60 * 60 * 1000);
    const matchResult = matchShift(now, user.shift, isNewEmployee);
    if (matchResult.matched) {
      targetShiftDate = matchResult.date;
    }
  }

  // 2. Look for active session today / matching current shift
  let attendance = await AttendanceModel.findOne({
    user: req.user.id,
    "punchIn.time": { $exists: true },
    "punchOut.time": { $exists: false },
    date: { $gte: targetShiftDate }
  }, { trackingLogs: 0 }).sort('-date');

  // 3. If no active session, look for completed attendance today / matching current shift
  if (!attendance) {
    attendance = await AttendanceModel.findOne({
      user: req.user.id,
      "punchIn.time": { $exists: true },
      date: { $gte: targetShiftDate, $lt: todayEnd }
    }, { trackingLogs: 0 }).sort('-date -punchIn.time');
  }

  // Resolve shift status for the client - allowed at any time
  let shiftStatus = { allowed: true, status: 'Active', message: 'Shift is active' };

  let todayAttendanceMapped = null;
  if (attendance) {
    const statsService = require('../services/employeeStatsService');
    const record = attendance.toObject();
    todayAttendanceMapped = {
      ...record,
      workingHours: statsService.calculateWorkingHours(record, user),
      status: statsService.resolveStatus(record, user)
    };
  }

  res.status(200).json({
    success: true,
    data: user,
    todayAttendance: todayAttendanceMapped,
    shiftStatus
  });
};

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
  try {
    const {
      name,
      email,
      mobile,
      shift,
      profileImage,
      designation,
      address,
      dob,
      bloodGroup,
      referenceName1,
      referenceNumber1,
      referenceName2,
      referenceNumber2,
      password,
      newPassword,
    } = req.body;

    const fieldsToUpdate = {};
    if (name !== undefined) fieldsToUpdate.name = name;
    if (email !== undefined) fieldsToUpdate.email = email;
    if (mobile !== undefined) fieldsToUpdate.mobile = mobile;
    if (shift !== undefined) fieldsToUpdate.shift = shift;
    if (designation !== undefined) fieldsToUpdate.designation = designation;
    if (address !== undefined) fieldsToUpdate.address = address;
    if (dob !== undefined) fieldsToUpdate.dob = dob ? new Date(dob) : null;
    if (bloodGroup !== undefined) fieldsToUpdate.bloodGroup = bloodGroup;
    if (referenceName1 !== undefined) fieldsToUpdate.referenceName1 = referenceName1;
    if (referenceNumber1 !== undefined) fieldsToUpdate.referenceNumber1 = referenceNumber1;
    if (referenceName2 !== undefined) fieldsToUpdate.referenceName2 = referenceName2;
    if (referenceNumber2 !== undefined) fieldsToUpdate.referenceNumber2 = referenceNumber2;

    // Upload profile image if provided
    if (profileImage && profileImage !== 'skipped') {
      try {
        const imageData = await uploadProfileImage(profileImage, req.user.id);
        if (imageData) {
          fieldsToUpdate.profileImage = imageData.url;
        }
      } catch (err) {
        console.log('Profile image upload warning:', err.message);
        // Continue without image if upload fails
      }
    }

    // If password or newPassword is provided in updatedetails, update password using save() to trigger bcrypt
    const passToSet = password || newPassword;
    if (passToSet && passToSet.trim()) {
      if (passToSet.trim().length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
      }
      const userDoc = await User.findById(req.user.id);
      if (userDoc) {
        userDoc.password = passToSet.trim();
        Object.assign(userDoc, fieldsToUpdate);
        await userDoc.save();
        const populatedUser = await User.findById(req.user.id).populate('shift').lean();
        return res.status(200).json({
          success: true,
          message: 'Profile and password updated successfully',
          data: populatedUser,
        });
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    }).populate('shift').lean();

    // Synchronize changes to matching Employee documents across the system
    try {
      const Employee = require('../models/Employee');
      const empUpdateFields = {};
      if (fieldsToUpdate.profileImage !== undefined) empUpdateFields.profileImage = fieldsToUpdate.profileImage;
      if (fieldsToUpdate.name !== undefined) empUpdateFields.name = fieldsToUpdate.name;
      if (fieldsToUpdate.mobile !== undefined) empUpdateFields.phone = fieldsToUpdate.mobile;
      if (fieldsToUpdate.address !== undefined) empUpdateFields.address = fieldsToUpdate.address;
      if (fieldsToUpdate.dob !== undefined) empUpdateFields.dob = fieldsToUpdate.dob;
      if (fieldsToUpdate.bloodGroup !== undefined) empUpdateFields.bloodGroup = fieldsToUpdate.bloodGroup;

      if (Object.keys(empUpdateFields).length > 0) {
        const searchCriteria = [{ userId: req.user.id }];
        if (user?.email) searchCriteria.push({ email: user.email.toLowerCase() });
        if (user?.mobile) searchCriteria.push({ phone: user.mobile });

        await Employee.updateMany(
          { $or: searchCriteria },
          { $set: empUpdateFields }
        );
      }
    } catch (empSyncErr) {
      console.warn('Employee profile sync warning:', empSyncErr.message);
    }

    // Broadcast live profile update via WebSockets to website and mobile apps
    try {
      const io = req.app.get('io') || global.io;
      if (io) {
        io.emit('employeeProfileUpdated', {
          userId: req.user.id,
          profileImage: user?.profileImage,
          user,
        });
      }
    } catch (socketErr) {
      console.warn('Socket broadcast error:', socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update user password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const { newPassword, password } = req.body;
    const passToUpdate = newPassword || password;

    if (!passToUpdate || passToUpdate.trim().length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters long',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Set new password - UserSchema pre-save hook will hash it with bcrypt
    user.password = passToUpdate.trim();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. Please use this password for all future logins.',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update online status
// @route   POST /api/auth/status
// @access  Private
exports.updateOnlineStatus = async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    await User.findByIdAndUpdate(req.user.id, { isOnline });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Get token from model, create cookie and send response
const sendTokenResponse = async (user, statusCode, res, deviceId = null, companyObj = null) => {
  // Update online status and active device
  const updateFields = { isOnline: true };
  if (deviceId && user.role === 'employee') {
    updateFields.lastActiveDevice = deviceId;
  }
  await User.findByIdAndUpdate(user._id, updateFields);

  // Create token
  const token = user.getSignedJwtToken();
  const refreshToken = user.getSignedRefreshToken();

  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_EXPIRE_COOKIE || 30) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  const Company = require('../models/Company');
  const isSuper = user.role === 'superadmin' || user.role === 'super_admin' || user.roleCode === 'TCSA1' || user.scope === 'GLOBAL';
  const compId = isSuper ? null : (user.companyId || user.company);
  let companyData = isSuper ? null : companyObj;
  if (!companyData && compId) {
    companyData = await Company.findById(compId).lean();
  }

  // Return a clean safe user object (never expose password hash)
  const safeUser = {
    _id: user._id,
    id: user._id,
    employeeId: user.employeeIdCode || user.employeeId,
    companyId: compId ? (compId._id || compId) : null,
    companyCode: companyData ? (companyData.companyCode || companyData.code) : null,
    companyName: companyData ? (companyData.companyName || companyData.name) : null,
    scope: isSuper ? 'GLOBAL' : (user.scope || 'COMPANY'),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    department: user.department,
    designation: user.designation,
    role: user.role,
    roleCode: user.roleCode,
    levelNumber: user.levelRef?.levelNumber || user.roleLevel,
    category: user.levelRef?.category || null,
    gradeCode: user.gradeRef?.code || user.roleGrade,
    status: user.status,
    profileImage: user.profileImage,
    shift: user.shift,
    workingPlace: user.workingPlace,
    gender: user.gender,
    joiningDate: user.joiningDate,
    isOnline: true,
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      refreshToken,
      user: safeUser,
    });
};

