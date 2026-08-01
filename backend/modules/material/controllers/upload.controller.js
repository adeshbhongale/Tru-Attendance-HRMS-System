const multer = require('multer');
const { uploadToCloudinary } = require('../../../config/cloudinary');

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

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'mms');

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

    const result = await uploadToCloudinary(buffer, 'mms');

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
