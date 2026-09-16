const mongoose = require('mongoose');

const StoreConfigurationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Store configuration must belong to a company'],
    index: true,
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Store department is required'],
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
  },
  teamLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Store Team Lead is required'],
  },
  employees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  escalationAllowed: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  tallyGodownName: {
    type: String,
    required: [true, 'Tally Godown Name is required'],
    trim: true,
  },
  dispatchChecklist: [{
    type: String,
    trim: true,
  }],
  returnChecklist: [{
    type: String,
    trim: true,
  }]
}, {
  timestamps: true,
});

StoreConfigurationSchema.index({ companyId: 1, department: 1 }, { unique: true });

module.exports = mongoose.model('StoreConfiguration', StoreConfigurationSchema);
