const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { upload } = require('../config/cloudinary');
const { createApiCache } = require('../middleware/cacheMiddleware');

const productsCache = createApiCache({ ttl: 300, keyPrefix: 'products' });

router.route('/')
  .get(productsCache, getProducts)
  .post(protect, adminMiddleware, upload.array('images', 4), createProduct);

router.route('/:id')
  .get(productsCache, getProductById)
  .put(protect, adminMiddleware, upload.array('images', 4), updateProduct)
  .delete(protect, adminMiddleware, deleteProduct);

module.exports = router;
