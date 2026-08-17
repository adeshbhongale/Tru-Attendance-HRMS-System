const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Working place must belong to a company'],
    index: true,
  },
  name: {
    type: String,
    required: true,
    default: 'Office Main',
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  radius: {
    type: Number,
    required: true,
    default: 200, // in meters
  },
  address: String,
  geofenceEnabled: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

LocationSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Location', LocationSchema);
