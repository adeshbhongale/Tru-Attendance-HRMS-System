const mongoose = require('mongoose');

const CityClassificationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
  },
  city: { type: String, required: true, trim: true, uppercase: true, index: true },
  cityClass: {
    type: String,
    enum: ['A+', 'A', 'B', 'C'],
    default: 'C',
    index: true,
  },
  state: { type: String, default: '' },
  aliases: [{ type: String, trim: true }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

CityClassificationSchema.index({ companyId: 1, city: 1 }, { unique: true });

module.exports = mongoose.models.CityClassification || mongoose.model('CityClassification', CityClassificationSchema);
