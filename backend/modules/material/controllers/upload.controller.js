const multer = require('multer');
const path = require('path');
const { uploadToCloudinary } = require('../../../config/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    // Accept all file formats: PDF, Word, Excel, CSV, Images, etc.
    cb(null, true);
  },
});

exports.uploadMiddleware = upload.single('file');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const folder = req.tenant?.companyId ? `mms/company/${req.tenant.companyId}` : 'mms';
    const ext = path.extname(req.file.originalname || '');
    const result = await uploadToCloudinary(req.file.buffer, folder, {
      ext,
      originalName: req.file.originalname,
      resource_type: 'auto',
    });

    res.json({
      message: 'File uploaded.',
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed.' });
  }
};

exports.uploadBase64 = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ message: 'No image base64 data provided.' });
    }

    // Strip base64 prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const folder = req.tenant?.companyId ? `mms/company/${req.tenant.companyId}` : 'mms';
    const result = await uploadToCloudinary(buffer, folder);

    res.json({
      message: 'Base64 image uploaded.',
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error('Base64 Upload error:', error);
    res.status(500).json({ message: 'Base64 upload failed.' });
  }
};
