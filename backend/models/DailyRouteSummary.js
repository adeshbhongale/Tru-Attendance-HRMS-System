const mongoose = require('mongoose');

/**
 * DailyRouteSummary — Long-retention daily summary for route + HR analytics.
 *
 * This keeps the route in a compact form for visual display and stores the day-level
 * summary values used by attendance / admin reporting without keeping all GPS rows.
 *
 * Storage pattern:
 *   - RawTrackingPoint: short retention, detailed low-level GPS history
 *   - DailyRouteSummary: long retention, compact daily route + summary metrics
 */
const DailyRouteSummarySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  firstCheckIn: {
    type: Date,
    default: null,
  },
  lastCheckOut: {
    type: Date,
    default: null,
  },
  totalDistance: {
    type: Number,
    default: 0,
  },
  workingHours: {
    type: Number,
    default: 0,
  },
  geofenceViolations: {
    type: Number,
    default: 0,
  },
  totalGpsPoints: {
    type: Number,
    default: 0,
  },
  // Compact route: array of [longitude, latitude, timestampMs]
  // Uses snapped coordinates where available, falls back to raw
  route: {
    type: [[Number]],
    default: [],
  },
  pointCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  versionKey: false,
});

DailyRouteSummarySchema.index({ companyId: 1, userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyRouteSummary', DailyRouteSummarySchema);
