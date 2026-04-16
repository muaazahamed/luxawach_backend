const mongoose = require('mongoose');

const ORDER_STATUS_FLOW = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
const ORDER_STATUS_LEGACY = ['processing', 'cancelled'];

const timelineEntrySchema = mongoose.Schema(
  {
    status: {
      type: String,
      enum: [...ORDER_STATUS_FLOW, 'cancelled'],
      required: true,
    },
    time: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

const orderSchema = mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    userId: { type: String, required: true }, // user id/email for logged in user, guest email otherwise
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    shippingAddress: {
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      phone: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        image: { type: String },
      }
    ],
    total: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: [...ORDER_STATUS_FLOW, ...ORDER_STATUS_LEGACY]
    },
    timeline: {
      type: [timelineEntrySchema],
      default: () => [{ status: 'pending', time: new Date() }],
    },
    tracking: {
      carrier: { type: String },
      trackingNumber: { type: String },
      estimatedDeliveryDate: { type: Date },
    },
    trackingAccessHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = {
  Order,
  ORDER_STATUS_FLOW,
};
