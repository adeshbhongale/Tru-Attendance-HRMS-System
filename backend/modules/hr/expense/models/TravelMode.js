const mongoose = require('mongoose');

const travelModeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  order: { type: Number, default: 0 },
}, {
  timestamps: true,
});

travelModeSchema.index({ companyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('TravelMode', travelModeSchema);
