const mongoose = require('mongoose');
const Department = require('../models/Department');
const User = require('../models/User');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private/Admin
exports.getDepartments = async (req, res, next) => {
  try {
    const companyId = req.tenant.companyId;
    const filter = { companyId };

    const departments = await Department.find(filter);
    
    // Aggregate employee counts by department name within company
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
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    employeeCounts.forEach(item => {
      if (item._id) {
        const key = String(item._id).trim().toLowerCase();
        countMap[key] = (countMap[key] || 0) + item.count;
      }
    });

    const dataWithCount = departments.map(dept => {
      const deptObj = dept.toObject ? dept.toObject() : dept;
      const nameKey = (dept.name || '').trim().toLowerCase();
      const idKey = dept._id ? dept._id.toString() : '';
      deptObj.employeeCount = countMap[nameKey] || countMap[idKey] || 0;
      return deptObj;
    });

    res.status(200).json({ success: true, count: departments.length, data: dataWithCount });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private/Admin
exports.createDepartment = async (req, res, next) => {
  try {
    const companyId = req.tenant.companyId;

    const deptData = {
      ...req.body,
      companyId
    };

    const department = await Department.create(deptData);
    res.status(201).json({ success: true, data: department });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private/Admin
exports.updateDepartment = async (req, res, next) => {
  try {
    const department = await Department.findOneAndUpdate({ _id: req.params.id, companyId: req.tenant.companyId }, req.body, {
      new: true,
      runValidators: true,
    });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    res.status(200).json({ success: true, data: department });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private/Admin
exports.deleteDepartment = async (req, res, next) => {
  try {
    const department = await Department.findOneAndDelete({ _id: req.params.id, companyId: req.tenant.companyId });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
