const Product = require('../models/Product');
const mongoose = require('mongoose');
const { isCloudinaryConfigured, uploadBufferToCloudinary } = require('../config/cloudinary');
const { invalidateCacheByPrefix } = require('../middleware/cacheMiddleware');

const normalizeToArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
};

const toNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureDatabaseReady = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503);
    throw new Error('Database not connected. Set MONGO_URI in server/.env and restart backend.');
  }
};

const ensureCloudinaryReadyForUpload = (req, res) => {
  if ((req.files || []).length > 0 && !isCloudinaryConfigured) {
    res.status(500);
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env.'
    );
  }
};

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res, next) => {
  try {
    const filters = {};

    if (req.query.category) {
      filters.category = req.query.category;
    }

    if (req.query.featured !== undefined) {
      filters.featured = toBoolean(req.query.featured);
    }

    if (req.query.q) {
      // Use MongoDB $text index for indexed full-text search (faster than $regex)
      filters.$text = { $search: req.query.q };
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit, 0), 0), 200);

    let query = Product.find(filters).sort({ createdAt: -1 }).select('-__v').lean();
    if (limit > 0) {
      query = query.limit(limit);
    }

    const products = await query;
    res.json(products);
  } catch (error) {
    next(error);
  }
};

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).select('-__v').lean();
    if (product) {
      res.json(product);
    } else {
      res.status(404);
      throw new Error('Product not found');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res, next) => {
  try {
    ensureDatabaseReady(res);
    ensureCloudinaryReadyForUpload(req, res);

    const uploadedImages = await Promise.all(
      (req.files || []).map(async (file) => {
        try {
          const uploaded = await uploadBufferToCloudinary(file.buffer, { folder: 'products' });
          return uploaded.secure_url;
        } catch (_error) {
          res.status(502);
          throw new Error('Product image upload failed');
        }
      })
    );
    const bodyImages = normalizeToArray(req.body.images);
    const imageUrls = [...bodyImages, ...uploadedImages].filter(Boolean);

    const product = new Product({
      name: req.body.name || 'Sample name',
      price: toNumber(req.body.price, 0),
      description: req.body.description || 'Sample description',
      images: imageUrls,
      brand: req.body.brand || 'Sample brand',
      category: req.body.category || 'Sample category',
      stock: toNumber(req.body.stock, 0),
      specifications: req.body.specifications || '',
      shipping: req.body.shipping || '',
      featured: toBoolean(req.body.featured, false),
    });

    const createdProduct = await product.save();
    invalidateCacheByPrefix('products');
    res.status(201).json(createdProduct);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res, next) => {
  try {
    ensureDatabaseReady(res);
    ensureCloudinaryReadyForUpload(req, res);

    // Build the update object from provided fields
    const updateFields = {};
    if (req.body.name !== undefined) updateFields.name = req.body.name;
    if (req.body.price !== undefined) updateFields.price = toNumber(req.body.price, 0);
    if (req.body.description !== undefined) updateFields.description = req.body.description;
    if (req.body.brand !== undefined) updateFields.brand = req.body.brand;
    if (req.body.category !== undefined) updateFields.category = req.body.category;
    if (req.body.stock !== undefined) updateFields.stock = toNumber(req.body.stock, 0);
    if (req.body.specifications !== undefined) updateFields.specifications = req.body.specifications;
    if (req.body.shipping !== undefined) updateFields.shipping = req.body.shipping;
    if (req.body.featured !== undefined) updateFields.featured = toBoolean(req.body.featured, false);

    // Handle images update
    const uploadedImages = await Promise.all(
      (req.files || []).map(async (file) => {
        try {
          const uploaded = await uploadBufferToCloudinary(file.buffer, { folder: 'products' });
          return uploaded.secure_url;
        } catch (_error) {
          res.status(502);
          throw new Error('Product image upload failed');
        }
      })
    );
    const existingImages = normalizeToArray(req.body.existingImages);
    const directImages = normalizeToArray(req.body.images);
    const nextImages = [...existingImages, ...directImages, ...uploadedImages].filter(Boolean);
    if (nextImages.length > 0) {
      updateFields.images = nextImages;
    }

    // Single DB round-trip instead of findById + save
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      res.status(404);
      throw new Error('Product not found');
    }

    invalidateCacheByPrefix('products');
    res.json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res, next) => {
  try {
    ensureDatabaseReady(res);

    // Single DB round-trip
    const deleted = await Product.findByIdAndDelete(req.params.id);

    if (!deleted) {
      res.status(404);
      throw new Error('Product not found');
    }

    invalidateCacheByPrefix('products');
    res.json({ message: 'Product removed' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
