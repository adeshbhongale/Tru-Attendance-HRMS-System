const mongoose = require('mongoose');
const Designation = require('../models/Designation');
const User = require('../models/User');

// @desc    Get all designations
// @route   GET /api/designations
// @access  Private/Admin
exports.getDesignations = async (req, res, next) => {
  try {
    const companyId = req.tenant.companyId;
    const filter = { companyId };

    const designations = await Designation.find(filter);
    
    // Aggregate employee counts by designation name within company
    let targetCompanyId = null;
    if (companyId) {
      targetCompanyId = mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : companyId;
    }

    const matchFilter = {
      status: { $in: ['active', 'ACTIVE'] }
    };
    if (targetCompanyId) {
      matchFilter.$or = [
        { companyId: targetCompanyId },
        { company: targetCompanyId }
      ];
    }

    const employeeCounts = await User.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$designation', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    employeeCounts.forEach(item => {
      if (item._id) {
        const key = String(item._id).trim().toLowerCase();
        countMap[key] = (countMap[key] || 0) + item.count;
      }
    });

    const dataWithCount = designations.map(desig => {
      const desigObj = desig.toObject ? desig.toObject() : desig;
      const nameKey = (desig.name || '').trim().toLowerCase();
      const idKey = desig._id ? desig._id.toString() : '';
      desigObj.employeeCount = countMap[nameKey] || countMap[idKey] || 0;
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
    const companyId = req.tenant.companyId;

    const desigData = {
      ...req.body,
      companyId
    };

    const designation = await Designation.create(desigData);
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
    const designation = await Designation.findOneAndUpdate({ _id: req.params.id, companyId: req.tenant.companyId }, req.body, {
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
    const designation = await Designation.findOneAndDelete({ _id: req.params.id, companyId: req.tenant.companyId });
    if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
