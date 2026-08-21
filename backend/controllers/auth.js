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

    if (cleanCompanyCode) {
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
            { companyId: targetCompany._id, mobile: trimmedIdentifier },
            { scope: 'GLOBAL', email: trimmedIdentifier.toLowerCase() },
            { scope: 'GLOBAL', employeeIdCode: trimmedIdentifier.toUpperCase() },
            { role: { $in: ['superadmin', 'TCSA1'] }, email: trimmedIdentifier.toLowerCase() }
          ]
        }).select('+password');
      }
    } else {
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

    // Mobile client login restriction (blocks only admin portal accounts)
    if (isMobileClient) {
      const uRole = (user.role || '').toLowerCase();
      const uRoleCode = (user.roleCode || '').toUpperCase();
      const EXCLUDED_ADMIN_ROLES = [
        'superadmin', 'super_admin',
        'company_admin', 'companyadmin'
      ];
      const EXCLUDED_ADMIN_CODES = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

      if (EXCLUDED_ADMIN_ROLES.includes(uRole) || EXCLUDED_ADMIN_CODES.includes(uRoleCode) || user.scope === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin portal accounts cannot log in to the mobile app.'
        });
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
    try {
      const user = await User.findById(req.user.id);
      if (user) {
        const io = req.app.get('io');
        const notificationService = require('../services/notificationService');
        await notificationService.createAndSendNotification({
          title: 'User Logout Alert 🚪',
          description: `User ${user.name} (${user.email || user.employeeIdCode || 'Staff'}) has logged out of the mobile application.`,
          type: 'general notification',
          frequency: 'Instant',
          targetType: 'Role-based Employees',
          targetRole: 'admin',
          companyId: user.companyId || req.tenant?.companyId || null,
          isAuto: false
        }, io);
      }
    } catch (err) {
      console.error('[Logout Alert] Failed to send admin notification:', err.message);
    }

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
  // --- End Self-Healing Logic ---

  // First, look for any active session (must have a punch-in time but NO punch-out)
  let attendance = await AttendanceModel.findOne({
    user: req.user.id,
    "punchIn.time": { $exists: true },
    "punchOut.time": { $exists: false }
  }, { trackingLogs: 0 }).sort('-date');

  // 2. If no active session, find the record matching the current shift window
  if (!attendance && user.shift) {
    const isNewEmployee = (now - new Date(user.createdAt)) < (48 * 60 * 60 * 1000);
    const matchResult = matchShift(now, user.shift, isNewEmployee);
    if (matchResult.matched) {
      attendance = await AttendanceModel.findOne({
        user: req.user.id,
        date: matchResult.date
      }, { trackingLogs: 0 });
    }
  }

  // Fallback: If still no attendance, look for the most recent completed record today
  if (!attendance) {
    attendance = await AttendanceModel.findOne({
      user: req.user.id,
      "punchIn.time": { $exists: true },
      date: { $gte: todayStart, $lt: todayEnd }
    }, { trackingLogs: 0 }).sort('-date -punchIn.time'); // Get the latest one
  }

  // Resolve shift status for the client - allowed at any time
  let shiftStatus = { allowed: true, status: 'Active', message: 'Shift is active' };

  let todayAttendanceMapped = null;
  if (attendance) {
    const statsService = require('../services/employeeStatsService');
    const record = attendance.toObject();
    todayAttendanceMapped = {
      ...record,
      workingHours: statsService.calculateWorkingHours(record),
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
    const { name, email, mobile, shift, profileImage, designation } = req.body;

    const fieldsToUpdate = {
      name,
      email,
      mobile,
      shift,
      designation
    };

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

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    }).populate('shift').lean();

    res.status(200).json({
      success: true,
      data: user,
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
  const compId = user.companyId || user.company;
  let companyData = companyObj;
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
    scope: user.scope || (user.role === 'superadmin' || user.role === 'TCSA1' ? 'GLOBAL' : 'COMPANY'),
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

