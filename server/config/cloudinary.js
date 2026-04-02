const cloudinary = require('cloudinary').v2;
const multer = require('multer');
require('dotenv').config();

const hasCloudinaryValue = (value) => Boolean(value && !/^your_/i.test(value));
const isCloudinaryConfigured =
  hasCloudinaryValue(process.env.CLOUDINARY_CLOUD_NAME) &&
  hasCloudinaryValue(process.env.CLOUDINARY_API_KEY) &&
  hasCloudinaryValue(process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn('Cloudinary is not configured. Image upload routes will reject file uploads.');
}

const storage = multer.memoryStorage();

const sanitizeFolder = (folder) =>
  String(folder || 'uploads')
    .trim()
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/|\/$/g, '') || 'uploads';

const uploadBufferToCloudinary = (buffer, { folder = 'uploads' } = {}) =>
  new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(new Error('Cloudinary is not configured'));
    }

    if (!buffer || !Buffer.isBuffer(buffer)) {
      return reject(new Error('Invalid file buffer'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: sanitizeFolder(folder),
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result?.secure_url) {
          return reject(new Error('Cloudinary upload did not return a secure URL'));
        }
        return resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

const upload = multer({ storage });

module.exports = { cloudinary, upload, isCloudinaryConfigured, uploadBufferToCloudinary };
