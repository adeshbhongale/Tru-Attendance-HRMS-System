const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  mobile: {
    type: String,
    required: [true, 'Please add a mobile number'],
    unique: true,
  },
  password: {
    type: String,
    required: false,
    select: false,
  },
  otp: String,
  otpExpires: Date,
  role: {
    type: String,
    enum: ['admin', 'employee'],
    default: 'employee',
  },
  department: String,
  designation: String,
  shift: {
    type: mongoose.Schema.ObjectId,
    ref: 'Shift',
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  profileImage: String,
  joiningDate: {
    type: Date,
    default: Date.now
  },
  monthlyLeaveLimit: {
    type: Number,
    default: 3,
  },
  leaveBalance: {
    type: Number,
    default: 3,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  refreshToken: String,
  workingPlace: {
    type: mongoose.Schema.ObjectId,
    ref: 'Location',
  },
  gender: {
    type: String,
    enum: ['Male', 'Female'],
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Sign Refresh Token and return
UserSchema.methods.getSignedRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
  });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
