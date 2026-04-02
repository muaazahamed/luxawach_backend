const express = require('express');
const { upload, isCloudinaryConfigured, uploadBufferToCloudinary } = require('../config/cloudinary');

const router = express.Router();

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!isCloudinaryConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Cloudinary is not configured',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'uploads' });
    const imageUrl = uploaded.secure_url;

    if (!imageUrl) {
      return res.status(500).json({
        success: false,
        message: 'Image upload failed',
      });
    }

    return res.status(200).json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
});

module.exports = router;
