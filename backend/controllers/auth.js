const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

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

    sendTokenResponse(user, 201, res);
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

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // Console log OTP for testing as requested
    console.log(`[TESTING] OTP for ${identifier}: ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Login with OTP
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Please provide email/mobile and OTP' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }]
    });

    if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Clear OTP after login
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
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

  // Also get today's attendance
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const attendance = await require('../models/Attendance').findOne({ user: req.user.id, date: today });

  res.status(200).json({
    success: true,
    data: user,
    todayAttendance: attendance
  });
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();
  const refreshToken = user.getSignedRefreshToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_EXPIRE_COOKIE * 24 * 60 * 60 * 1000
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
        role: user.role,
      },
    });
};
