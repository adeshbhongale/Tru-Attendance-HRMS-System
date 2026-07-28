const Material = require('../models/Material');

// @desc    Get all materials
// @route   GET /api/materials
// @access  Private
exports.getMaterials = async (req, res) => {
  try {
    const { search = '', isActive, page = 1, limit = 500 } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Material.countDocuments(query);
    const materials = await Material.find(query)
      .populate('preferredVendors', 'vendorName vendorCode primaryContact email mobile')
      .sort({ name: 1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      data: materials,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get single material
// @route   GET /api/materials/:id
// @access  Private
exports.getMaterialById = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id)
      .populate('preferredVendors', 'vendorName vendorCode primaryContact email mobile');
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }
    res.status(200).json({ success: true, data: material });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Create new material
// @route   POST /api/materials
// @access  Private
exports.createMaterial = async (req, res) => {
  try {
    if (!req.body.code) {
      req.body.code = 'MAT-' + Math.floor(100000 + Math.random() * 900000);
    } else {
      req.body.code = req.body.code.toUpperCase();
    }

    if (!req.body.barcode) {
      req.body.barcode = '890' + Math.floor(100000000 + Math.random() * 900000000);
    }

    const material = await Material.create({
      ...req.body,
      createdBy: req.user ? req.user.id : null,
    });

    res.status(201).json({ success: true, data: material });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Material code must be unique' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update material
// @route   PUT /api/materials/:id
// @access  Private
exports.updateMaterial = async (req, res) => {
  try {
    let material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }

    if (req.body.code) req.body.code = req.body.code.toUpperCase();

    material = await Material.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: material });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete material
// @route   DELETE /api/materials/:id
// @access  Private
exports.deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }

    await Material.deleteOne({ _id: req.params.id });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
