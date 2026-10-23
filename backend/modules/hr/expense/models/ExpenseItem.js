const mongoose = require('mongoose');

// Metadata only — binaries live in Cloudinary / local upload storage.
const attachmentSchema = new mongoose.Schema({
  name: String,
  url: String,
  publicId: { type: String, default: '' }, // storage key
  type: String, // MIME type
  size: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const expenseItemSchema = new mongoose.Schema({
  expenseType: { type: String, default: 'OTHER', uppercase: true, trim: true },
  expenseTypeName: { type: String, default: '' },
  customerName: { type: String, default: '' },
  description: { type: String, default: '' },
  expenseDate: { type: Date, default: null },
  city: { type: String, default: '' },
  cityClass: { type: String, default: 'C' },

  // Vehicle / conveyance details
  vehicle: { type: String, default: '' }, // twoWheeler, car, eBike, eCar, company
  vehicleOwnership: { type: String, enum: ['personal', 'company'], default: 'personal' },
  distanceKm: { type: Number, default: 0 },
  // Local Conveyance visit options: NO_VISIT (default) or VISIT (requires service report)
  visitType: { type: String, enum: ['NO_VISIT', 'VISIT', ''], default: 'NO_VISIT', uppercase: true, trim: true },
  isVisit: { type: Boolean, default: false },
  // Local Conveyance photo proofs (uploaded instead of bills)
  numberPlatePhotos: [attachmentSchema],
  startKmPhotos: [attachmentSchema], // odometer at start
  endKmPhotos: [attachmentSchema], // odometer at end
  // Service reports for visit conveyance (or item-specific service reports)
  serviceReports: [attachmentSchema],
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  mode: { type: String, default: '' },

  // Lodging details
  hotelName: { type: String, default: '' },
  sharedWith: { type: String, default: '' },
  accommodationType: { type: String, default: 'NORMAL' }, // NORMAL, FRIEND_RELATIVE, TWIN_SHARING
  days: { type: Number, default: 1 },

  // Core amounts
  requestedAmount: { type: Number, default: 0 },
  allowedAmount: { type: Number, default: 0 },
  excessAmount: { type: Number, default: 0 },

  // Proof & eligibility
  proofRequired: { type: Boolean, default: false },
  proofStatus: { type: String, enum: ['REQUIRED', 'RECEIVED', 'MISSING', 'SELF_ATTESTED'], default: 'REQUIRED' },
  selfAttestation: { type: Boolean, default: false },

  // Calculation audit trail
  calculationBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  ruleCode: { type: String, default: '' },

  // Other expense sub-type & fields (purchase vs normal)
  otherSubType: { type: String, enum: ['PURCHASE', 'NORMAL', ''], default: '', uppercase: true, trim: true },
  barcodeNumber: { type: String, default: '', trim: true },
  quantity: { type: String, default: '', trim: true },

  // Attachments
  attachments: [attachmentSchema],
}, {
  _id: true,
});

module.exports = expenseItemSchema;
module.exports.attachmentSchema = attachmentSchema;
