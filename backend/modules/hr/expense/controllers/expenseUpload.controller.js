const multer = require('multer');
const path = require('path');
const { uploadToCloudinary } = require('../../../../config/cloudinary');
const { getActivePolicy } = require('../services/policyEngine');
const { resolvePolicyConfig } = require('../services/claimRules');
const access = require('../services/expenseAccess');

// Hard ceiling; the per-company limit (receiptRules.maxFileSizeMb) is enforced below.
const HARD_LIMIT_MB = 25;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_LIMIT_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, ODF, and all supporting document types
    cb(null, true);
  },
});

/** multer wrapper that turns multer errors into readable 4xx JSON responses. */
exports.uploadMiddleware = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    return next();
  }
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: `File is too large. Maximum allowed size is ${HARD_LIMIT_MB} MB.` });
    }
    if (req.body && (req.body.image || req.body.base64 || req.body.file)) {
      return next();
    }
    return res.status(415).json({ success: false, code: 'UNSUPPORTED_FILE', message: err.message || 'Unsupported file.' });
  });
};

/** Detect the real file type from its first bytes (rejects renamed / corrupted files). */
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif';
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
  }
  return null;
}

const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/avif': '.avif' };

async function receiptRulesFor(req) {
  const companyId = access.resolveCompanyId(req);
  const policy = companyId ? await getActivePolicy(companyId) : null;
  return resolvePolicyConfig(policy).receiptRules;
}

/**
 * POST /api/expense/uploads — multipart proof document upload (field: file)
 * Validates the company's allowed types / size and the real file signature.
 */
exports.uploadProofFile = async (req, res) => {
  try {
    if (!req.file) {
      const rawImage = req.body?.image || req.body?.base64 || (typeof req.body?.file === 'string' && req.body.file.startsWith('data:') ? req.body.file : null);
      if (rawImage) {
        req.body.image = rawImage;
        return exports.uploadProofBase64(req, res);
      }
      return res.status(400).json({ success: false, code: 'NO_FILE', message: 'No file uploaded.' });
    }

    const rules = await receiptRulesFor(req);
    const maxBytes = Math.min(HARD_LIMIT_MB, Number(rules.maxFileSizeMb) || 10) * 1024 * 1024;
    if (req.file.size > maxBytes) {
      return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: `"${req.file.originalname}" is too large. Maximum allowed size is ${Math.round(maxBytes / 1048576)} MB.` });
    }

    let realType = sniffMime(req.file.buffer);
    if (!realType && req.file.mimetype) {
      realType = req.file.mimetype;
    }
    if (!realType) {
      realType = 'application/octet-stream';
    }
    const isDoc = realType.startsWith('image/') || realType === 'application/pdf' || realType.includes('opendocument') || realType.includes('document') || realType.includes('officedocument') || realType === 'application/octet-stream' || req.body?.purpose === 'serviceReport';
    const allowed = rules.allowedMimeTypes.map((t) => String(t).toLowerCase());
    if (!isDoc && allowed.length > 0 && !allowed.includes(realType)) {
      return res.status(415).json({ success: false, code: 'UNSUPPORTED_FILE', message: `"${req.file.originalname}" is not a supported file type.` });
    }

    const baseName = path.basename(req.file.originalname || 'proof').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'proof';
    const ext = EXT[realType] || (path.extname(baseName) || '.jpg');
    const originalName = path.extname(baseName) ? baseName : `${baseName}${ext}`;
    const isNonImage = !realType.startsWith('image/');
    const result = await uploadToCloudinary(req.file.buffer, folder, {
      originalName,
      ext,
      forceCloudinary: true,
      resource_type: isNonImage ? 'raw' : 'image',
    });

    const data = {
      url: result.secure_url || result.url,
      publicId: result.public_id || result.publicId || '',
      size: req.file.size,
      name: originalName,
      type: realType,
    };
    access.audit({ req, action: 'RECEIPT_UPLOADED', claim: null, description: `Receipt uploaded: ${originalName}`, metadata: { ...data, purpose: req.body?.purpose || 'receipt' } }).catch(() => {});
    res.json({ success: true, data });
  } catch (error) {
    console.error('Expense upload error:', error);
    res.status(500).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: error.message || 'Upload to Cloudinary failed. Please check your internet connection and retry.',
    });
  }
};

/**
 * POST /api/expense/uploads/base64 — base64 image proof upload
 */
exports.uploadProofBase64 = async (req, res) => {
  try {
    const rawImage = req.body?.image || req.body?.base64 || req.body?.file;
    const name = req.body?.name || 'proof';
    if (!rawImage) {
      return res.status(400).json({ success: false, message: 'No image base64 data provided.' });
    }
    const folder = `expense/${req.tenant?.companyId || 'company'}`;
    const result = await uploadToCloudinary(rawImage, folder, { forceCloudinary: true });
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
    res.status(500).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: error.message || 'Upload to Cloudinary failed. Please check your internet connection and retry.',
    });
  }
};

exports._sniffMime = sniffMime;
