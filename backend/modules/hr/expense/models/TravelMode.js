const mongoose = require('mongoose');

/**
 * Travel subtype (Vehicle Type configuration). Embedded so every subtype keeps a stable
 * ObjectId that claims and Level Entitlements reference. Subtypes are never hard-deleted:
 * removing one in Admin marks it inactive so historical claims keep resolving.
 *
 * workflow:
 *  - STANDARD: normal travel claim fields (amount, remark, bill).
 *  - KM_RATE : Own Vehicle — start/end km readings x configured per-km rate (+ photos).
 */
const travelSubtypeSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  workflow: { type: String, enum: ['STANDARD', 'KM_RATE'], default: 'STANDARD' },
  // KM_RATE only: vehicle photo + start/end odometer photos are mandatory
  photosRequired: { type: Boolean, default: false },
  conveyanceRateKey: { type: String, enum: ['', 'twoWheeler', 'car', 'eBike', 'eCar'], default: '' },
  ratePerKm: { type: Number, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  order: { type: Number, default: 0 },
}, { _id: true });

const travelModeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  order: { type: Number, default: 0 },
  // A mode with at least one active subtype requires the employee to pick one (Taxi/Auto has none).
  subtypes: { type: [travelSubtypeSchema], default: undefined },
  // Company-decided per-km rate for Own Vehicle in Travel (independent of Local Conveyance)
  ratePerKm: { type: Number, default: null },
  // Optional fallback key if ratePerKm is not explicitly set
  conveyanceRateKey: { type: String, enum: ['', 'twoWheeler', 'car', 'eBike', 'eCar'], default: '' },
}, {
  timestamps: true,
});

travelModeSchema.index({ companyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.TravelMode || mongoose.model('TravelMode', travelModeSchema);
module.exports.travelSubtypeSchema = travelSubtypeSchema;
