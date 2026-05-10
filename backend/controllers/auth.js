const User = require('../models/User');
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

// @desc    Send OTP to email/mobile
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res, next) => {
  try {
    const { identifier } = req.body; // Can be email or mobile

    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only admins can request OTP for web login
    if (user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Access denied. Employees cannot login to the admin panel.' });
    }

    // Generate 7-digit OTP
    const otp = Math.floor(1000000 + Math.random() * 9000000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();

    // Console log OTP for testing as requested
    console.log(`
______________

otp :    ${otp}

______________
      `);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { identifier, otp, password } = req.body;

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
    if (password) {
      // Mobile app login (uses password)
      if (user.role === 'admin') {
        return res.status(401).json({ success: false, message: 'Access denied. Admins must login via the Web Portal.' });
      }

      if (!user.password) {
        return res.status(401).json({ success: false, message: 'Password not set for this account. Please contact admin.' });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      return await sendTokenResponse(user, 200, res);
    } else if (otp) {
      // Web panel login (uses OTP)
      if (user.role !== 'admin') {
        return res.status(401).json({ success: false, message: 'Access denied. Employees must login via the Mobile App.' });
      }

      if (String(user.otp) !== String(otp) || user.otpExpires < Date.now()) {
        return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
      }

      // Clear OTP
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();

      return await sendTokenResponse(user, 200, res);
    } else {
      return res.status(400).json({ success: false, message: 'Please provide password or OTP' });
    }
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

  // First, look for an active session (punched in but not punched out)
  let attendance = await require('../models/Attendance').findOne({
    user: req.user.id,
    "punchOut.time": { $exists: false }
  }).sort('-date');

  // 2. If no active session, look for a record that was completed today OR has today's date
  if (!attendance) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    attendance = await require('../models/Attendance').findOne({
      user: req.user.id,
      $or: [
        { date: { $gte: startOfDay, $lt: endOfDay } },
        { "punchOut.time": { $gte: startOfDay, $lt: endOfDay } }
      ]
    }).sort('-punchOut.time');
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
    const { name, email, mobile, shift, profileImage } = req.body;

    const fieldsToUpdate = {
      name,
      email,
      mobile,
      shift,
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
