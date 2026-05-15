const mongoose = require('mongoose');

// 1. Raw Tracking Points - For high-fidelity route history
const rawTrackingPointSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, index: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  accuracy: Number,
  speed: Number, // meters/second
  heading: Number,
  altitude: Number,
  timestamp: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['valid', 'suspicious', 'weak', 'idle'], default: 'valid' },
  isMock: { type: Boolean, default: false }
});

rawTrackingPointSchema.index({ location: '2dsphere' });

// 2. Tracking Sessions - To group points by punch-in session
const trackingSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startTime: { type: Date, required: true },
  endTime: Date,
  totalDistance: { type: Number, default: 0 }, // in KM
  maxSpeed: { type: Number, default: 0 },
  avgSpeed: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' }
});

// 3. Summarized Tracking Logs - The 1-minute aggregation for admin tables
const trackingLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackingSession', index: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  startLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  endLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  startAddress: String,
  endAddress: String,
  distance: { type: Number, default: 0 }, // KM travelled in this minute
  avgSpeed: { type: Number, default: 0 },
  maxSpeed: { type: Number, default: 0 },
  movementStatus: { type: String, enum: ['Walking', 'Bike', 'Vehicle', 'Idle', 'Suspicious'], default: 'Idle' },
  isSuspicious: { type: Boolean, default: false },
  suspiciousReason: String,
  avgAccuracy: Number,
  insideRadius: { type: Boolean, default: false },
  path: [[Number]], // Array of [lon, lat] for the route preview in this minute
  createdAt: { type: Date, default: Date.now, index: true }
});

trackingLogSchema.index({ createdAt: -1 });

// 4. Live Employee Status - For ultra real-time dashboard updates
const liveStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lastLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  lastAddress: String,
  currentSpeed: { type: Number, default: 0 },
  currentStatus: { type: String, enum: ['online', 'offline'], default: 'offline' },
  movementState: { type: String, default: 'Idle' },
  totalDistanceToday: { type: Number, default: 0 },
  lastUpdate: { type: Date, default: Date.now },
  batteryLevel: Number,
  isCharging: Boolean
});

liveStatusSchema.index({ lastLocation: '2dsphere' });

module.exports = {
  RawTrackingPoint: mongoose.model('RawTrackingPoint', rawTrackingPointSchema),
  TrackingSession: mongoose.model('TrackingSession', trackingSessionSchema),
  TrackingLog: mongoose.model('TrackingLog', trackingLogSchema),
  LiveEmployeeStatus: mongoose.model('LiveEmployeeStatus', liveStatusSchema)
};
