const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Guarantee .env is loaded regardless of import order
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const isConfigured = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && secret && !key.startsWith('your_'));
};

const initCloudinary = () => {
  if (isConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    return true;
  }
  return false;
};

// Initialize at startup
initCloudinary();

/**
 * Save file locally when Cloudinary is unavailable or offline
 */
const saveLocalFallback = async (inputData, isBase64 = false, options = {}) => {
  if (!inputData || inputData === 'skipped' || inputData === 'pending_background_upload') {
    return null;
  }
  const uploadDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const detectedExt = options.ext || (options.originalName ? path.extname(options.originalName) : '');
  const ext = isBase64 ? '.webp' : (detectedExt || '.bin');
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const uploadPath = path.join(uploadDir, filename);

  if (isBase64) {
    const base64Data = inputData.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(uploadPath, Buffer.from(base64Data, 'base64'));
  } else {
    await fs.promises.writeFile(uploadPath, inputData);
  }

  const baseUrl =
    process.env.BACKEND_URL ||
    process.env.SERVER_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ||
    (process.env.NODE_ENV === 'production'
      ? 'https://tru-attendance-hrms-system-production.up.railway.app'
      : `http://localhost:${process.env.PORT || 5000}`);
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/uploads/${filename}`;
  return {
    url,
    secure_url: url,
    public_id: filename,
    publicId: filename,
    width: 800,
    height: 600,
    format: ext ? ext.replace('.', '') : 'bin',
  };
};

/**
 * Universal Upload Function
 * Supports both Binary File Buffers (Multer memoryStorage) AND Base64 Strings
 * Directly uploads claim receipts/proofs to Cloudinary (no local fallback in public folder)
 */
const uploadToCloudinary = async (input, folder = 'hrms', options = {}) => {
  if (!input || input === 'skipped' || input === 'pending_background_upload') return null;

  // Guard against device-local file URIs that cannot be read on the server
  if (typeof input === 'string' && (input.startsWith('file://') || input.startsWith('content://'))) {
    console.warn('⚠️ Rejected local device URI passed to uploadToCloudinary:', input.substring(0, 30));
    return null;
  }

  const isBase64 = typeof input === 'string';
  const hasCloudinary = initCloudinary();
  const isClaimUpload = options.forceCloudinary || options.strictCloudinary || (typeof folder === 'string' && folder.startsWith('expense'));

  if (!hasCloudinary) {
    throw new Error('Cloudinary is not configured on server. Please check CLOUDINARY credentials in .env.');
  }

  try {
    if (isBase64) {
      const dataUri = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
      const isRaw = options.resource_type === 'raw' || !dataUri.startsWith('data:image/');
      const result = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: isRaw ? 'raw' : (options.resource_type || 'image'),
        secure: true,
        quality: isRaw ? undefined : 'auto:good',
        fetch_format: isRaw ? undefined : 'auto',
        transformation: isRaw ? undefined : [{ width: 1600, height: 1600, crop: 'limit' }],
        timeout: 45000,
      });
      return {
        url: result.secure_url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        publicId: result.public_id,
      };
    } else {
      const isRaw = options.resource_type === 'raw' ||
        options.ext?.match(/\.(pdf|odt|ods|odp|doc|docx|xls|xlsx|txt|rtf|csv)$/i) ||
        options.originalName?.toLowerCase().match(/\.(pdf|odt|ods|odp|doc|docx|xls|xlsx|txt|rtf|csv)$/i);
      const result = await new Promise((resolve, reject) => {
        const streamOptions = {
          folder,
          resource_type: isRaw ? 'raw' : (options.resource_type || 'image'),
          secure: true,
          quality: isRaw ? undefined : 'auto:good',
          fetch_format: isRaw ? undefined : 'auto',
          transformation: isRaw ? undefined : [{ width: 1600, height: 1600, crop: 'limit' }],
          timeout: 45000,
        };
        const stream = cloudinary.uploader.upload_stream(
          streamOptions,
          (error, res) => {
            if (error) reject(error);
            else resolve(res);
          }
        );
        stream.end(input);
      });
      return {
        url: result.secure_url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
      };
    }
  } catch (err) {
    console.error('⚠️ Cloudinary upload error:', err.message);
    const isNetworkError =
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      (err.message && (err.message.includes('timeout') || err.message.includes('network') || err.message.includes('ENOTFOUND')));
    const msg = isNetworkError
      ? 'Internet connection error: Unable to upload to Cloudinary. Please check your internet connection and try again.'
      : `Cloudinary upload failed: ${err.message || 'Network error'}. Please check your internet connection and try again.`;
    throw new Error(msg);
  }
};

/**
 * Upload profile image to Cloudinary (strictly Cloudinary, no local fallback)
 */
const uploadProfileImage = async (base64Image, userId) => {
  if (!base64Image) return null;

  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Cannot upload profile photo.');
  }

  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'hrms/profiles',
      public_id: `profile_${userId}`,
      overwrite: true,
      resource_type: 'auto',
      secure: true,
      format: 'webp',
      quality: 'auto',
      timeout: 25000,
    });

    return {
      url: result.secure_url,
      secure_url: result.secure_url,
      publicId: result.public_id,
      public_id: result.public_id,
    };
  } catch (err) {
    console.error('⚠️ Profile upload error:', err.message);
    throw new Error(`Profile upload to Cloudinary failed: ${err.message || 'Network error'}. Please check your internet connection and try again.`);
  }
};

/**
 * Clear temporary demo files in Cloudinary storage folder (or local uploads).
 * CRITICAL SAFEGUARD: Never delete attendance selfies or employee profile photos!
 */
const clearCloudinaryStorage = async () => {
  try {
    if (isConfigured()) {
      // Only clear temporary demo/customer documents, NEVER delete permanent attendance selfies or employee profile photos!
      await cloudinary.api.delete_resources_by_prefix('hrms/customer_documents/').catch(() => {});
      await cloudinary.api.delete_resources_by_prefix('hrms/temp/').catch(() => {});
    }
    const uploadDir = path.join(__dirname, '../public/uploads');
    if (fs.existsSync(uploadDir)) {
      const files = await fs.promises.readdir(uploadDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(uploadDir, file)).catch(() => {});
      }
    }
    return true;
  } catch (err) {
    return false;
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadProfileImage,
  clearCloudinaryStorage,
  get useMock() {
    return !isConfigured();
  },
};
