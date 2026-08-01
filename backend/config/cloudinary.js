const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const useMock =
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  process.env.CLOUDINARY_API_KEY.startsWith('your_');

if (!useMock) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  const uploadDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

/**
 * Save file locally when Cloudinary is unavailable or offline
 */
const saveLocalFallback = async (inputData, isBase64 = false) => {
  const uploadDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  const uploadPath = path.join(uploadDir, filename);

  if (isBase64) {
    const base64Data = inputData.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(uploadPath, Buffer.from(base64Data, 'base64'));
  } else {
    await fs.promises.writeFile(uploadPath, inputData);
  }

  const port = process.env.PORT || 5000;
  const url = `http://localhost:${port}/uploads/${filename}`;
  return {
    url,
    secure_url: url,
    public_id: filename,
    publicId: filename,
    width: 800,
    height: 600,
    format: 'jpg',
  };
};

/**
 * Universal Upload Function
 * Supports both Binary File Buffers (Multer memoryStorage) AND Base64 Strings with offline fallback
 */
const uploadToCloudinary = async (input, folder = 'hrms') => {
  if (!input || input === 'skipped') return null;

  const isBase64 = typeof input === 'string';

  if (useMock) {
    return await saveLocalFallback(input, isBase64);
  }

  try {
    if (isBase64) {
      const result = await cloudinary.uploader.upload(input, {
        folder,
        resource_type: 'auto',
        secure: true,
        format: 'webp',
        quality: 'auto',
      });
      return {
        url: result.secure_url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        publicId: result.public_id,
      };
    } else {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
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
    console.error('⚠️ Cloudinary upload failed, falling back to local storage:', err.message);
    return await saveLocalFallback(input, isBase64);
  }
};

/**
 * Upload profile image to Cloudinary (or local fallback)
 */
const uploadProfileImage = async (base64Image, userId) => {
  if (!base64Image) return null;

  if (useMock) {
    return await saveLocalFallback(base64Image, true);
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
    });

    return {
      url: result.secure_url,
      secure_url: result.secure_url,
      publicId: result.public_id,
      public_id: result.public_id,
    };
  } catch (err) {
    console.error('⚠️ Profile upload error, using local fallback:', err.message);
    return await saveLocalFallback(base64Image, true);
  }
};

/**
 * Clear all images in Cloudinary storage folder (or local uploads)
 */
const clearCloudinaryStorage = async () => {
  try {
    if (!useMock) {
      await cloudinary.api.delete_resources_by_prefix('hrms/');
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
  useMock,
};
