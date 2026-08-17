const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Employee must belong to a company'],
    index: true,
  },
  employeeId: {
    type: String,
    required: [true, 'Please add an employee ID'],
    uppercase: true,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add employee name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please add employee email'],
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
  },
  designationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Designation',
    default: null,
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RolePermission',
    default: null,
  },
  roleCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: null,
  },
  gradeLevel: {
    type: Number,
    default: null,
  },
  reportingTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  joiningDate: {
    type: Date,
    default: Date.now,
  },
  leavingDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'TERMINATED', 'active', 'inactive'],
    default: 'ACTIVE',
  },
  profileImage: {
    type: String,
    default: '',
  },
  address: String,
  gender: String,
  dob: Date,
  bloodGroup: String,
  documents: [{
    docName: String,
    docType: String,
    fileUrl: String,
    uploadedOn: { type: Date, default: Date.now }
  }],
}, {
  timestamps: true,
});

// Compound unique index: Employee ID unique per company
EmployeeSchema.index({ companyId: 1, employeeId: 1 }, { unique: true });

module.exports = mongoose.model('Employee', EmployeeSchema);
