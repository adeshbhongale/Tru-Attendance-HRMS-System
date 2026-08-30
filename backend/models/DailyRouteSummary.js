const mongoose = require('mongoose');

/**
 * DailyRouteSummary — Ultra-compact storage of the snapped route path
 * after raw tracking points are deleted.
 * 
 * Each document stores one user's one day of route data as a simple
 * array of [longitude, latitude, timestamp] tuples.
 * 
 * Size comparison per tracking point:
 *   - RawTrackingPoint: ~500-800 bytes (50+ fields, indexes, metadata)
 *   - DailyRouteSummary entry: ~24 bytes (3 numbers in an array)
 *   → ~95-97% space savings
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
  // Compact route: array of [longitude, latitude, timestampMs]
  // Uses snapped coordinates where available, falls back to raw
  route: {
    type: [[Number]],
    default: [],
  },
  // Total distance in KM for the day (pre-computed)
  totalDistance: {
    type: Number,
    default: 0,
  },
  pointCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: false,
  versionKey: false,
});

DailyRouteSummarySchema.index({ companyId: 1, userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyRouteSummary', DailyRouteSummarySchema);
