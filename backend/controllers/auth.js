const User = require('../models/User');
const AttendanceModel = require('../models/Attendance');
const ErrorResponse = require('../utils/errorResponse');
const { uploadProfileImage } = require('../utils/cloudinary');

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
    const { identifier, password } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Please provide email or mobile' });
    }

    // Find user
    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check credentials
    if (!password) {
      return res.status(400).json({ success: false, message: 'Please provide a password' });
    }

    // Regular login logic
    if (!user.password) {
      return res.status(401).json({ success: false, message: 'Password not set for this account. Please contact admin.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    return await sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, { isOnline: false });
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
  const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

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
    const cutoffTime = new Date();
    cutoffTime.setHours(cHour, cMin, 0, 0);
    if (cHour < 12 && now.getHours() > 12) cutoffTime.setDate(cutoffTime.getDate() + 1);

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
  }).sort('-date');

  // 2. If no active session, look for the most recent completed record today or from a night shift ending today
  if (!attendance) {
    attendance = await AttendanceModel.findOne({
      user: req.user.id,
      "punchIn.time": { $exists: true },
      $or: [
        { date: { $gte: todayStart, $lt: todayEnd } },
        { "punchOut.time": { $gte: todayStart, $lt: todayEnd } }
      ]
    }).sort('-date -punchIn.time'); // Get the latest one
  }

  res.status(200).json({
    success: true,
    data: user,
    todayAttendance: attendance
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
const sendTokenResponse = async (user, statusCode, res) => {
  // Update online status
  await User.findByIdAndUpdate(user._id, { isOnline: true });

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

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        department: user.department,
        profileImage: user.profileImage,
        role: user.role,
      },
    });
};
