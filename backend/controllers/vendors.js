const Vendor = require('../models/Vendor');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private
exports.getVendors = async (req, res) => {
  try {
    const { search = '', isActive, page = 1, limit = 500 } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { vendorName: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .sort({ vendorName: 1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
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
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Create new vendor
// @route   POST /api/vendors
// @access  Private
exports.createVendor = async (req, res) => {
  try {
    if (!req.body.vendorCode) {
      req.body.vendorCode = 'VEND-' + Math.floor(100000 + Math.random() * 900000);
    }

    const vendor = await Vendor.create({
      ...req.body,
      createdBy: req.user ? req.user.id : null,
    });

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
