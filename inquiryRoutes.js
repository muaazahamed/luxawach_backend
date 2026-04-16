const mongoose = require('mongoose');

const productSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    specifications: { type: String },
    shipping: { type: String },
    price: { type: Number, required: true, default: 0 },
    category: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
    images: [{ type: String }],
    brand: { type: String },
    featured: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common query patterns
productSchema.index({ category: 1, featured: 1 });
productSchema.index({ featured: 1, createdAt: -1 });
productSchema.index({ brand: 1 });

// Full-text index for search (replaces slow $regex)
productSchema.index({ name: 'text', brand: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
