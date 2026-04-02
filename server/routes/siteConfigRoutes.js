const express = require('express');
const router = express.Router();
const {
  getSiteConfig,
  updateSiteConfig
} = require('../controllers/siteConfigController');
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createApiCache } = require('../middleware/cacheMiddleware');

const siteConfigCache = createApiCache({ ttl: 600, keyPrefix: 'siteconfig' });

router.route('/:type')
  .get(siteConfigCache, getSiteConfig)
  .put(protect, adminMiddleware, updateSiteConfig);

module.exports = router;
