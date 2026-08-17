const mongoose = require('mongoose');

const CompanyModuleSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  module: {
    type: String,
    required: true,
    enum: ['MATERIAL_MOVEMENT', 'ATTENDANCE', 'LEAVE', 'EXPENSE', 'CRM', 'TRACKING'],
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

CompanyModuleSchema.index({ companyId: 1, module: 1 }, { unique: true });

module.exports = mongoose.model('CompanyModule', CompanyModuleSchema);
