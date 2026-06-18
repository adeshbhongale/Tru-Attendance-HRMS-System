const mongoose = require('mongoose');

// 1. Raw Tracking Points - For high-fidelity route history
const rawTrackingPointSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, index: true },
  tripId: { type: String, index: true },
  deviceId: String,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  // Raw coordinates (original GPS)
  rawLatitude: Number,
  rawLongitude: Number,
  // Snapped coordinates (road-corrected)
  snappedLatitude: Number,
  snappedLongitude: Number,
  accuracy: Number,
  speed: Number, // meters/second
  heading: Number,
  altitude: Number,
  battery: Number,
  timestamp: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['valid', 'suspicious', 'weak', 'idle'], default: 'valid' },
  isMock: { type: Boolean, default: false },
  address: String,
  // Road snapping metadata
  routeStatus: { type: String, enum: ['raw', 'snapped', 'failed'], default: 'raw' },
  processedTime: Date,
  provider: { type: String, enum: ['google', 'osrm', 'none'], default: 'none' }
});

rawTrackingPointSchema.index({ location: '2dsphere' });
rawTrackingPointSchema.index({ tripId: 1, timestamp: 1 });

// 2. Tracking Sessions - To group points by punch-in session
const trackingSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tripId: { type: String, index: true },
  startTime: { type: Date, required: true },
  endTime: Date,
  totalDistance: { type: Number, default: 0 }, // in KM (road distance if available)
  totalRawDistance: { type: Number, default: 0 }, // Haversine distance
  maxSpeed: { type: Number, default: 0 },
  avgSpeed: { type: Number, default: 0 },
  stops: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  provider: { type: String, enum: ['google', 'osrm', 'none'], default: 'none' }
});

// 3. Summarized Tracking Logs - The 1-minute aggregation for admin tables
const trackingLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackingSession', index: true },
  tripId: { type: String, index: true },
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
  distance: { type: Number, default: 0 }, // KM travelled in this minute (snapped if available)
  rawDistance: { type: Number, default: 0 }, // Haversine distance
  avgSpeed: { type: Number, default: 0 },
  maxSpeed: { type: Number, default: 0 },
  movementStatus: { type: String, enum: ['Walking', 'Bike', 'Vehicle', 'Idle', 'Suspicious'], default: 'Idle' },
  isSuspicious: { type: Boolean, default: false },
  suspiciousReason: String,
  avgAccuracy: Number,
  insideRadius: { type: Boolean, default: false },
  path: [[Number]], // Array of [lon, lat] for the route preview in this minute
  snappedPath: [[Number]], // Array of [lon, lat] road-snapped coordinates
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
  // Dual location tracking: raw vs snapped
  lastRawLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  lastSnappedLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  lastAddress: String,
  currentSpeed: { type: Number, default: 0 },
  avgSpeed: { type: Number, default: 0 },
  currentStatus: { type: String, enum: ['online', 'offline'], default: 'offline' },
  trackingStatus: { type: String, enum: ['active', 'completed', 'offline'], default: 'offline' },
  movementState: { type: String, default: 'Idle' },
  totalDistanceToday: { type: Number, default: 0 },
  travelTime: { type: Number, default: 0 }, // minutes
  stops: { type: Number, default: 0 },
  lastUpdate: { type: Date, default: Date.now },
  batteryLevel: Number,
  isCharging: Boolean,
  signalQuality: { type: String, enum: ['strong', 'weak', 'lost'], default: 'strong' },
  tripId: String,
  lastGeocodedLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  lastGeocodeTime: { type: Date }
});

liveStatusSchema.index({ lastLocation: '2dsphere' });

module.exports = {
  RawTrackingPoint: mongoose.model('RawTrackingPoint', rawTrackingPointSchema),
  TrackingSession: mongoose.model('TrackingSession', trackingSessionSchema),
  TrackingLog: mongoose.model('TrackingLog', trackingLogSchema),
  LiveEmployeeStatus: mongoose.model('LiveEmployeeStatus', liveStatusSchema)
};
