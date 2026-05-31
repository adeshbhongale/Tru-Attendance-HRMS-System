const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload base64 image to Cloudinary
const uploadToCloudinary = async (base64Image, folder = 'hrms/attendance') => {
    try {
        if (!base64Image || base64Image === 'skipped') {
            return null;
        }

        const result = await cloudinary.uploader.upload(base64Image, {
            folder,
            resource_type: 'auto',
            secure: true,
            format: 'webp',
            quality: 'auto',
        });

        return {
            url: result.secure_url,
            publicId: result.public_id,
        };
    } catch (err) {
        console.error('Cloudinary upload error:', err.message);
        throw new Error('Failed to upload image to Cloudinary');
    }
};

// Upload profile image to Cloudinary
const uploadProfileImage = async (base64Image, userId) => {
    try {
        if (!base64Image) {
            return null;
        }

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
            publicId: result.public_id,
        };
    } catch (err) {
        console.error('Cloudinary upload error:', err.message);
        throw new Error('Failed to upload profile image');
    }
};

// Clear all images in a folder
const clearCloudinaryStorage = async () => {
    try {
        // Clear storage

        // Delete all resources with prefix 'hrms/'
        await cloudinary.api.delete_resources_by_prefix('hrms/');
        // Cleared

        return true;
    } catch (err) {
        return false;
    }
};

module.exports = {
    uploadToCloudinary,
    uploadProfileImage,
    clearCloudinaryStorage,
};
