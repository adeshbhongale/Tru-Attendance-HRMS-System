const Vendor = require('../models/Vendor');
const { uploadToCloudinary } = require('../config/cloudinary');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private
exports.getVendors = async (req, res) => {
  try {
    const {
      search = '',
      isActive,
      industry,
      state,
      page = 1,
      limit = 500
    } = req.query;

    const query = {};

    if (req.user && req.user.role === 'employee') {
      query.isActive = true;
    } else if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (industry) query.industry = { $regex: industry, $options: 'i' };
    if (state) query['registeredOffice.state'] = { $regex: state, $options: 'i' };

    if (search) {
      query.$or = [
        { vendorName: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { 'financialInfo.gstNumber': { $regex: search, $options: 'i' } },
        { 'financialInfo.panNumber': { $regex: search, $options: 'i' } },
        { 'financialInfo.msmeNumber': { $regex: search, $options: 'i' } },
        { 'primaryContact.contactPerson': { $regex: search, $options: 'i' } },
        { 'registeredOffice.city': { $regex: search, $options: 'i' } },
        { 'registeredOffice.state': { $regex: search, $options: 'i' } },
        { 'products.productName': { $regex: search, $options: 'i' } },
        { 'products.productCode': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .populate('materialsSupplied.material', 'name code category uom barcode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: vendors,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get single vendor
// @route   GET /api/vendors/:id
// @access  Private
exports.getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('materialsSupplied.material', 'name code category uom barcode');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Helper function to upload document base64 to Cloudinary
const processDocumentsCloudinary = async (documents = []) => {
  const processedDocs = [];
  for (const doc of documents) {
    let fileUrl = doc.fileUrl;
    if (fileUrl && fileUrl.startsWith('data:')) {
      try {
        const uploadRes = await uploadToCloudinary(fileUrl, 'hrms/vendor_documents');
        if (uploadRes && uploadRes.url) {
          fileUrl = uploadRes.url;
        }
      } catch (err) {
        console.error('Vendor Document Cloudinary upload error:', err.message);
      }
    }
    processedDocs.push({
      ...doc,
      fileUrl,
      uploadedOn: doc.uploadedOn || new Date(),
    });
  }
  return processedDocs;
};

// @desc    Create new vendor
// @route   POST /api/vendors
// @access  Private
exports.createVendor = async (req, res) => {
  try {
    if (!req.body.vendorCode) {
      const count = await Vendor.countDocuments();
      req.body.vendorCode = 'VEND-' + String(10001 + count);
    }

    if (req.body.vendorName && !req.body.companyName) {
      req.body.companyName = req.body.vendorName;
    }

    if (req.body.primaryContact && req.body.primaryContact.contactPerson) {
      req.body.contactPerson = req.body.primaryContact.contactPerson;
      req.body.mobile = req.body.primaryContact.mobileNumber;
    }

    if (req.body.financialInfo && req.body.financialInfo.gstNumber) {
      req.body.gstin = req.body.financialInfo.gstNumber;
    }

    if (req.body.registeredOffice && req.body.registeredOffice.addressLine1) {
      const reg = req.body.registeredOffice;
      req.body.address = `${reg.addressLine1 || ''}, ${reg.city || ''}, ${reg.state || ''} ${reg.pincode || ''}`;
    }

    if (req.body.documents && Array.isArray(req.body.documents)) {
      req.body.documents = await processDocumentsCloudinary(req.body.documents);
    }

    const vendorData = {
      ...req.body,
      createdBy: req.user ? req.user.id : undefined,
    };

    const vendor = await Vendor.create(vendorData);
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Vendor code must be unique' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Private
exports.updateVendor = async (req, res) => {
  try {
    let vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (req.body.vendorName && !req.body.companyName) {
      req.body.companyName = req.body.vendorName;
    }

    if (req.body.primaryContact && req.body.primaryContact.contactPerson) {
      req.body.contactPerson = req.body.primaryContact.contactPerson;
      req.body.mobile = req.body.primaryContact.mobileNumber;
    }

    if (req.body.financialInfo && req.body.financialInfo.gstNumber) {
      req.body.gstin = req.body.financialInfo.gstNumber;
    }

    if (req.body.registeredOffice && req.body.registeredOffice.addressLine1) {
      const reg = req.body.registeredOffice;
      req.body.address = `${reg.addressLine1 || ''}, ${reg.city || ''}, ${reg.state || ''} ${reg.pincode || ''}`;
    }

    if (req.body.documents && Array.isArray(req.body.documents)) {
      req.body.documents = await processDocumentsCloudinary(req.body.documents);
    }

    vendor = await Vendor.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete vendor
// @route   DELETE /api/vendors/:id
// @access  Private
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    await Vendor.deleteOne({ _id: req.params.id });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Upload vendor document directly to Cloudinary
// @route   POST /api/vendors/upload-document
// @access  Private
exports.uploadVendorDocument = async (req, res) => {
  try {
    const { file, docType } = req.body;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Please provide file data' });
    }

    const uploadRes = await uploadToCloudinary(file, 'hrms/vendor_documents');
    if (!uploadRes || !uploadRes.url) {
      return res.status(500).json({ success: false, message: 'Cloudinary upload failed' });
    }

    res.status(200).json({
      success: true,
      url: uploadRes.url,
      publicId: uploadRes.publicId,
      docType: docType || 'Document'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
