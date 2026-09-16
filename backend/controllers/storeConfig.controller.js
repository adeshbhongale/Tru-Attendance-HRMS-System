const StoreConfiguration = require('../models/StoreConfiguration');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get store configuration
// @route   GET /api/v1/store-config
// @access  Private (SuperAdmin)
exports.getStoreConfig = async (req, res, next) => {
  try {
    const companyId = req.user.companyId || req.header('x-company-id');
    if (!companyId) {
      return next(new ErrorResponse('Company ID is required', 400));
    }

    const config = await StoreConfiguration.findOne({ companyId })
      .populate('department', 'name prefix')
      .populate('location', 'name')
      .populate('teamLead', 'name email employeeIdCode')
      .populate('employees', 'name email employeeIdCode')
      .populate('escalationAllowed', 'name email employeeIdCode');

    if (!config) {
      return res.status(200).json({ success: true, data: null, message: 'Store configuration not found for this company' });
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or update store configuration
// @route   POST /api/v1/store-config
// @access  Private (SuperAdmin)
exports.upsertStoreConfig = async (req, res, next) => {
  try {
    const companyId = req.user.companyId || req.header('x-company-id');
    if (!companyId) {
      return next(new ErrorResponse('Company ID is required', 400));
    }

    let config = await StoreConfiguration.findOne({ companyId });

    req.body.companyId = companyId;

    if (config) {
      config = await StoreConfiguration.findByIdAndUpdate(config._id, req.body, {
        new: true,
        runValidators: true,
      });
    } else {
      config = await StoreConfiguration.create(req.body);
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};
