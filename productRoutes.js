const mongoose = require('mongoose');

const siteConfigSchema = mongoose.Schema(
  {
    type: { type: String, required: true, unique: true }, // 'header', 'footer', or 'home'
    data: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  {
    timestamps: true,
  }
);

const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);

module.exports = SiteConfig;
