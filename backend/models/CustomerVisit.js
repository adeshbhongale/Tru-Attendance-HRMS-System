const mongoose = require('mongoose');

const CustomerVisitSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Customer visit must belong to a company'],
    index: true,
  },
  visitType: {
    type: String,
    enum: ['customer', 'self'],
    default: 'customer',
  },
  customerId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Customer',
    required: function() { return this.visitType === 'customer'; },
  },
  customerName: {
    type: String,
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  employeeName: {
    type: String,
    required: true,
  },
  scheduledDate: {
    type: Date,
    required: true,
  },
  scheduledTime: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Upcoming', 'To Do', 'In Progress', 'Completed', 'Over Due'],
    default: 'Upcoming',
  },
  startLocation: {
    type: String,
  },
  endLocation: {
    type: String,
  },
  startLatitude: {
    type: Number,
  },
  startLongitude: {
    type: Number,
  },
  endLatitude: {
    type: Number,
  },
  endLongitude: {
    type: Number,
  },
  startAddress: {
    type: String,
  },
  endAddress: {
    type: String,
  },
  startSelfie: {
    type: String,
  },
  endSelfie: {
    type: String,
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  reason: {
    type: String,
  },
  startReason: {
    type: String,
  },
  completeReason: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

CustomerVisitSchema.index({ companyId: 1, employeeId: 1, scheduledDate: -1 });

module.exports = mongoose.model('CustomerVisit', CustomerVisitSchema);
