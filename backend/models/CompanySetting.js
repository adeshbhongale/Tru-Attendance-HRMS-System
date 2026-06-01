const mongoose = require('mongoose');

const CompanySettingSchema = new mongoose.Schema({
  weeklyOffs: {
    type: [String],
    default: ['Sunday']
  },
  globalHolidays: [{
    date: Date,
    name: String
  }],
  leaveTypesEnabled: [{
    type: mongoose.Schema.ObjectId,
    ref: 'LeaveType'
  }],
  officeLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    radius: {
      type: Number,
      default: 200
    },
    geofenceEnabled: {
      type: Boolean,
      default: true
    }
  },
  androidApkUrl: {
    type: String,
    default: () => process.env.ANDROID_APK_URL || ''
  },
  iosAppUrl: {
    type: String,
    default: () => process.env.IOS_APP_URL || ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CompanySetting', CompanySettingSchema);
