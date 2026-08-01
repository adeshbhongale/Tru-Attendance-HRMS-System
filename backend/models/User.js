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
    default: 'employee',
    trim: true,
    index: true,
  },
  roleCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: null,
    index: true,
  },
  roleLevel: {
    type: Number,
    default: null,
  },
  roleGrade: {
    type: String,
    lowercase: true,
    default: null,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  levelRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Level',
  },
  gradeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade',
  },
  reportsTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  responsibilities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Responsibility',
  }],
  responsibilityCodes: [{
    type: String,
    uppercase: true,
    trim: true,
  }],
  branch: {
    type: String,
    trim: true,
    default: '',
  },
  dataScope: {
    type: String,
    enum: ['SELF', 'TEAM', 'DEPARTMENT', 'BRANCH', 'COMPANY', 'ALL'],
    default: 'SELF',
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
  fcmToken: {
    type: String,
    default: null,
  },
  deviceType: {
    type: String,
    default: null,
  },
  address: {
    type: String,
    trim: true,
  },
  dob: {
    type: Date,
  },
  bloodGroup: {
    type: String,
    trim: true,
  },
  referenceName1: {
    type: String,
    trim: true,
  },
  referenceNumber1: {
    type: String,
    trim: true,
  },
  referenceName2: {
    type: String,
    trim: true,
  },
  referenceNumber2: {
    type: String,
    trim: true,
  },
  documents: [{
    docName: { type: String, trim: true },
    docType: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    uploadedOn: { type: Date, default: Date.now }
  }],
  lastActiveDevice: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

UserSchema.virtual('fullName').get(function () {
  return this.name;
});

UserSchema.virtual('employeeId').get(function () {
  return this.mobile || (this._id ? this._id.toString() : '');
});

UserSchema.virtual('effectiveRoleLevel').get(function () {
  if (this.roleCode) {
    const match = this.roleCode.trim().match(/^TC[A-Z]{2}([1-5])[ABC]$/i);
    if (match) return parseInt(match[1], 10);
    if (['TCSA1', 'TCCA1', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(this.roleCode.trim().toUpperCase())) return 1;
  }
  if (this.roleLevel && this.roleLevel >= 1 && this.roleLevel <= 5) {
    return this.roleLevel;
  }
  switch (this.role) {
    case 'super_admin': return 1;
    case 'company_admin': return 1;
    case 'admin': return 1;
    case 'department_admin': return 1;
    case 'team_lead': return 2;
    default: return 4;
  }
});

UserSchema.virtual('effectiveRoleGrade').get(function () {
  if (this.roleCode) {
    const match = this.roleCode.trim().match(/^TC[A-Z]{2}[1-5]([ABC])$/i);
    if (match) return match[1].toLowerCase();
  }
  if (this.roleGrade && ['a', 'b', 'c'].includes(this.roleGrade.toLowerCase())) {
    return this.roleGrade.toLowerCase();
  }
  return 'a';
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
