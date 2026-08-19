const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  name: String,
  url: String,
  type: String,
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

  // Attachments
  attachments: [attachmentSchema],
}, {
  _id: true,
});

module.exports = expenseItemSchema;
