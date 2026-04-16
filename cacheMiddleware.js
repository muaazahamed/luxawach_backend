const SiteConfig = require('../models/SiteConfig');
const { invalidateCacheByPrefix } = require('../middleware/cacheMiddleware');

// @desc    Get site config by type
// @route   GET /api/siteconfig/:type
// @access  Public
const getSiteConfig = async (req, res, next) => {
  try {
    const config = await SiteConfig.findOne({ type: req.params.type }).select('data -_id').lean();
    if (config) {
      res.json(config.data);
    } else {
      res.status(404);
      throw new Error('Config not found');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Update site config
// @route   PUT /api/siteconfig/:type
// @access  Private/Admin
const updateSiteConfig = async (req, res, next) => {
  try {
    const { type } = req.params;
    let config = await SiteConfig.findOne({ type });

    if (config) {
      config.data = req.body;
      const updatedConfig = await config.save();
      invalidateCacheByPrefix('siteconfig');
      res.json(updatedConfig.data);
    } else {
      // Create it if it doesn't exist
      const newConfig = new SiteConfig({
        type,
        data: req.body
      });
      const createdConfig = await newConfig.save();
      invalidateCacheByPrefix('siteconfig');
      res.status(201).json(createdConfig.data);
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSiteConfig,
  updateSiteConfig
};
