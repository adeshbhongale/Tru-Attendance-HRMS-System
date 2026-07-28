const mongoose = require('mongoose');

const DepartmentContactSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  mobile: { type: String, trim: true },
  email: { type: String, trim: true },
});

const BranchSchema = new mongoose.Schema({
  unit: { type: String, trim: true },
  branchName: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  gstNo: { type: String, trim: true },
  isDefaultDelivery: { type: Boolean, default: false },
});

const DocumentSchema = new mongoose.Schema({
  docType: { type: String, trim: true }, // GST Certificate, MSME, PAN Card, Cancelled Cheque
  docName: { type: String, trim: true },
  fileUrl: { type: String, trim: true },
  issueDate: { type: Date },
  expiryDate: { type: Date },
  uploadedBy: { type: String, trim: true },
  uploadedOn: { type: Date, default: Date.now },
  version: { type: String, default: '1.0' },
});

const InstalledProductSchema = new mongoose.Schema({
  productRef: { type: mongoose.Schema.ObjectId, ref: 'Product' },
  productId: { type: String, trim: true },
  productName: { type: String, trim: true },
  productDescription: { type: String, trim: true },
  productImage: { type: String, trim: true },
  modelNumber: { type: String, trim: true },
  productCode: { type: String, trim: true },
  machineSerialNo: { type: String, trim: true },
  barcode: { type: String, trim: true },
  qrCode: { type: String, trim: true },
  brand: { type: String, trim: true },
  manufactureDate: { type: Date },
  installationDate: { type: Date },
  warrantyExpiry: { type: Date },
  amcExpiry: { type: Date },
  currentStatus: { type: String, default: 'Running' }, // Running, Stopped, Service
  lastServiceDate: { type: Date },
  engineerAssigned: { type: String, trim: true },
  serviceHistory: [{
    date: { type: Date, default: Date.now },
    type: { type: String }, // Preventive, Repair, Installation
    notes: { type: String },
    engineer: { type: String }
  }],
  movementHistory: [{
    date: { type: Date, default: Date.now },
    fromSection: { type: String },
    toSection: { type: String },
    notes: { type: String }
  }]
});

const SubSectionSchema = new mongoose.Schema({
  subSectionName: { type: String, trim: true },
  description: { type: String, trim: true },
  installedProducts: [InstalledProductSchema]
});

const ProductionSectionSchema = new mongoose.Schema({
  sectionName: { type: String, trim: true }, // Machining, Assembly, Packing, Testing, Forging, etc.
  description: { type: String, trim: true },
  manager: { type: String, trim: true },
  location: { type: String, trim: true },
  status: { type: String, default: 'Active' },
  installedProducts: [InstalledProductSchema],
  subSections: [SubSectionSchema]
});

const CustomerSchema = new mongoose.Schema({
  // 1. Basic Information
  customerName: {
    type: String,
    required: [true, 'Please add a customer name'],
    trim: true,
  },
  customerCode: {
    type: String,
    required: [true, 'Please add a customer code'],
    unique: true,
    trim: true,
  },
  customerType: {
    type: String,
    default: 'End User', // OEM, End User, Dealer, Distributor, Export Customer
    trim: true,
  },
  industry: { type: String, trim: true },
  website: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  altPhone: { type: String, trim: true },
  companyLogo: { type: String, trim: true },
  status: {
    type: String,
    default: 'Active', // Active, Inactive, Blacklisted
    trim: true,
  },
  customerSince: { type: Date, default: Date.now },
  creditPeriod: { type: Number, default: 0 }, // Credit period in days
  remarks: { type: String, trim: true },

  // Backward compatibility fields
  contactPerson: { type: String, trim: true },
  mobile: { type: String, trim: true },
  address: { type: String, trim: true },
  latitude: { type: Number },
  longitude: { type: Number },
  notes: { type: String, trim: true },

  // 2. Address Details
  registeredOffice: {
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    area: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: 'India', trim: true },
    pincode: { type: String, trim: true },
  },
  branches: [BranchSchema],

  // 3. Primary Contact
  primaryContact: {
    contactPerson: { type: String, trim: true },
    designation: { type: String, trim: true },
    mobileNumber: { type: String, trim: true },
    email: { type: String, trim: true },
    landline: { type: String, trim: true },
    extension: { type: String, trim: true },
    whatsApp: { type: String, trim: true },
  },

  // 4. Department Contacts
  departmentContacts: {
    purchase: [DepartmentContactSchema],
    accounts: [DepartmentContactSchema],
    production: [DepartmentContactSchema],
    maintenance: [DepartmentContactSchema],
  },

  // 5. Financial Information
  financialInfo: {
    panNumber: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    dateOfIncorporation: { type: Date },
    msmeNumber: { type: String, trim: true },
    msmeStatus: { type: String, default: 'Micro' }, // Micro, Small, Medium, None
    msmeCategory: { type: String, default: 'small' }, // very large, large, big, mid, small
  },

  // 6. Document Uploads
  documents: [DocumentSchema],

  // 7. Bank Details
  bankDetails: {
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true },
    branchName: { type: String, trim: true },
    bankAddress: { type: String, trim: true },
    accountType: { type: String, default: 'Current' },
  },

  // 8. Production Module (Customer -> Production Section -> Sub Section -> Installed Products)
  productionSections: [ProductionSectionSchema],

  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Customer', CustomerSchema);
