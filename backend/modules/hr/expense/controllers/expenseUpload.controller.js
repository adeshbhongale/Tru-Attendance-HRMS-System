const multer = require('multer');
const { uploadToCloudinary } = require('../../../../config/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed.'));
    }
  },
});

exports.uploadMiddleware = upload.single('file');

/**
 * POST /api/expense/uploads — multipart proof document upload
 */
exports.uploadProofFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const folder = `expense/${req.tenant?.companyId || 'company'}`;
    const result = await uploadToCloudinary(req.file.buffer, folder);
    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        size: req.file.size,
        name: req.file.originalname || 'proof',
        type: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Expense upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed.' });
  }
};

/**
 * POST /api/expense/uploads/base64 — base64 image proof upload
 */
exports.uploadProofBase64 = async (req, res) => {
  try {
    const { image, name } = req.body || {};
    if (!image) {
      return res.status(400).json({ success: false, message: 'No image base64 data provided.' });
    }
    const folder = `expense/${req.tenant?.companyId || 'company'}`;
    const result = await uploadToCloudinary(image, folder);
    res.json({
      success: true,
      data: {
        url: result.secure_url || result.url,
        publicId: result.public_id || result.publicId,
        size: null,
        name: (name || 'proof').replace(/\.[^/.]+$/, '') + '.webp',
        type: 'image/webp',
      },
    });
  } catch (error) {
    console.error('Expense base64 upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed.' });
  }
};
