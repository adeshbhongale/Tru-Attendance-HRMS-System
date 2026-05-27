const Designation = require('../models/Designation');
const User = require('../models/User');

// @desc    Get all designations
// @route   GET /api/designations
// @access  Private/Admin
exports.getDesignations = async (req, res, next) => {
  try {
    const designations = await Designation.find();
    
    // Aggregate employee counts by designation name
    const employeeCounts = await User.aggregate([
      { $match: { role: 'employee' } },
      { $group: { _id: '$designation', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    employeeCounts.forEach(item => {
      if (item._id) {
        countMap[item._id.toLowerCase()] = item.count;
      }
    });

    const dataWithCount = designations.map(desig => {
      const desigObj = desig.toObject();
      desigObj.employeeCount = countMap[desig.name.toLowerCase()] || 0;
      return desigObj;
    });

    res.status(200).json({ success: true, count: designations.length, data: dataWithCount });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create designation
// @route   POST /api/designations
// @access  Private/Admin
exports.createDesignation = async (req, res, next) => {
  try {
    const designation = await Designation.create(req.body);
    res.status(201).json({ success: true, data: designation });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update designation
// @route   PUT /api/designations/:id
// @access  Private/Admin
exports.updateDesignation = async (req, res, next) => {
  try {
    const designation = await Designation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
    res.status(200).json({ success: true, data: designation });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete designation
// @route   DELETE /api/designations/:id
// @access  Private/Admin
exports.deleteDesignation = async (req, res, next) => {
  try {
    const designation = await Designation.findByIdAndDelete(req.params.id);
    if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
