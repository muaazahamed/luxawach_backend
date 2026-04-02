const mongoose = require('mongoose');
const crypto = require('crypto');
const { Order, ORDER_STATUS_FLOW } = require('../models/Order');
const Product = require('../models/Product');

const TRACKING_SECRET = String(process.env.ORDER_TRACKING_SECRET || '');
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const normalizeStatus = (status) => {
  if (!status) return null;
  const lowered = String(status).trim().toLowerCase();
  if (lowered === 'processing') return 'packed';
  return lowered;
};

const canAdvanceStatus = (currentStatus, nextStatus) => {
  const currentIndex = ORDER_STATUS_FLOW.indexOf(normalizeStatus(currentStatus));
  const nextIndex = ORDER_STATUS_FLOW.indexOf(nextStatus);
  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex >= currentIndex;
};

const createOrderId = async () => {
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const candidate = `ORD${Math.floor(10000 + Math.random() * 90000)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({ orderId: candidate });
    if (!exists) return candidate;
  }
  return `ORD${Date.now().toString().slice(-8)}`;
};

const createTrackingToken = () => crypto.randomBytes(24).toString('hex');

const hashTrackingToken = (token) => {
  if (!TRACKING_SECRET) {
    throw new Error('ORDER_TRACKING_SECRET is required');
  }
  return crypto
    .createHash('sha256')
    .update(`${String(token || '')}:${TRACKING_SECRET}`)
    .digest('hex');
};

const hasValidTrackingToken = (providedToken, storedHash) => {
  if (!providedToken || !storedHash) return false;
  const computed = hashTrackingToken(String(providedToken).trim());
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const sanitizeOrderForPublicTracking = (order) => ({
  _id: order._id,
  orderId: order.orderId,
  items: Array.isArray(order.items)
    ? order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        image: item.image,
      }))
    : [],
  total: order.total,
  status: order.status,
  timeline: order.timeline,
  tracking: order.tracking,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

const buildOrderLookupQuery = (idOrOrderId) => {
  const value = String(idOrOrderId || '').trim();
  if (!value) return null;

  if (value.toUpperCase().startsWith('ORD')) {
    return { orderId: value.toUpperCase() };
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    return { _id: value };
  }

  return { orderId: value.toUpperCase() };
};

const applyStatusAndTrackingUpdate = async ({ order, status, tracking }) => {
  const nextStatus = normalizeStatus(status);
  if (nextStatus) {
    const allowedStatuses = [...ORDER_STATUS_FLOW, 'cancelled'];
    if (!allowedStatuses.includes(nextStatus)) {
      throw new Error(`Invalid status. Allowed: ${allowedStatuses.join(', ')}`);
    }
    if (nextStatus === 'cancelled') {
      if (normalizeStatus(order.status) === 'delivered') {
        throw new Error('Delivered orders cannot be cancelled');
      }
      if (normalizeStatus(order.status) !== 'cancelled') {
        order.status = 'cancelled';
        if (!Array.isArray(order.timeline)) order.timeline = [];
        order.timeline.push({ status: 'cancelled', time: new Date() });
      }
    } else {
      if (!canAdvanceStatus(order.status, nextStatus)) {
        throw new Error(`Status cannot move backward from ${order.status} to ${nextStatus}`);
      }
      if (order.status !== nextStatus) {
        order.status = nextStatus;
        if (!Array.isArray(order.timeline)) order.timeline = [];
        order.timeline.push({ status: nextStatus, time: new Date() });
      }
    }
  }

  if (tracking && typeof tracking === 'object') {
    order.tracking = {
      ...order.tracking,
      ...tracking,
    };
  }

  return order.save();
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Public (guest + logged-in)
const addOrderItems = async (req, res, next) => {
  try {
    const {
      orderItems,
      shippingAddress,
      userId
    } = req.body;

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      res.status(400);
      throw new Error('No order items');
    }

    const sanitizedAddress = {
      fullName: String(shippingAddress?.fullName || '').trim(),
      email: String(shippingAddress?.email || '').trim().toLowerCase(),
      address: String(shippingAddress?.address || shippingAddress?.street || '').trim(),
      city: String(shippingAddress?.city || '').trim(),
      postalCode: String(shippingAddress?.postalCode || shippingAddress?.zipCode || '').trim(),
      phone: String(shippingAddress?.phone || '').trim(),
      state: String(shippingAddress?.state || '').trim(),
      country: String(shippingAddress?.country || '').trim(),
    };

    if (!sanitizedAddress.fullName || !sanitizedAddress.email || !sanitizedAddress.address || !sanitizedAddress.city || !sanitizedAddress.postalCode) {
      res.status(400);
      throw new Error('Shipping name, email, address, city, and postal code are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedAddress.email)) {
      res.status(400);
      throw new Error('Valid shipping email is required');
    }

    const normalizedItems = orderItems.map((item) => ({
      productId: String(item?.product || item?.productId || '').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      displayName: String(item?.name || '').trim(),
      displayImage: String(item?.image || '').trim(),
    }));

    const productIds = normalizedItems.map((item) => item.productId);
    const hasInvalidProductIds = productIds.some((id) => !mongoose.Types.ObjectId.isValid(id));
    if (hasInvalidProductIds) {
      res.status(400);
      throw new Error('Invalid product reference in order items');
    }

    const products = await Product.find({ _id: { $in: productIds } })
      .select('name price images')
      .lean();
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    if (products.length !== productIds.length) {
      res.status(400);
      throw new Error('One or more products are unavailable');
    }

    const sanitizedItems = normalizedItems.map((item) => {
      const product = productMap.get(item.productId);
      const image = item.displayImage || product?.images?.[0] || '';
      const name = item.displayName || product?.name || 'Product';
      return {
        product: item.productId,
        name,
        quantity: item.quantity,
        price: Number(product?.price || 0),
        image,
      };
    });

    const computedTotal = sanitizedItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    const authUser = req.user || null;
    const guestIdentity = sanitizedAddress.email || 'guest';
    const trackingToken = createTrackingToken();

    const order = new Order({
      orderId: await createOrderId(),
      user: authUser?._id || null,
      userId: String(authUser?._id || authUser?.email || userId || guestIdentity),
      items: sanitizedItems,
      shippingAddress: sanitizedAddress,
      total: computedTotal,
      status: 'pending',
      timeline: [{ status: 'pending', time: new Date() }],
      trackingAccessHash: hashTrackingToken(trackingToken),
    });

    const createdOrder = await order.save();
    res.status(201).json({
      _id: createdOrder._id,
      orderId: createdOrder.orderId,
      trackingToken,
      status: createdOrder.status,
      total: createdOrder.total,
      timeline: createdOrder.timeline,
      createdAt: createdOrder.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single order by ID (owner/admin OR safe tracking token)
// @route   GET /api/orders/:id
// @access  Public
const getOrderById = async (req, res, next) => {
  try {
    const query = buildOrderLookupQuery(req.params.id);
    if (!query) {
      res.status(404);
      return res.json({ message: 'Order not found' });
    }

    const order = await Order.findOne(query).select('-__v +trackingAccessHash').lean();

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const requester = req.user || null;
    const requesterId = String(requester?._id || '');
    const requesterEmail = String(requester?.email || '').trim().toLowerCase();
    const isAdmin =
      requester &&
      requester.role === 'admin' &&
      requesterEmail &&
      ADMIN_EMAIL &&
      requesterEmail === ADMIN_EMAIL;

    const isOwner =
      requester &&
      (String(order.user || '') === requesterId ||
        String(order.userId || '').toLowerCase() === requesterId.toLowerCase() ||
        String(order.userId || '').toLowerCase() === requesterEmail);

    if (!isAdmin && !isOwner) {
      const trackingToken =
        String(req.query?.trackingToken || '').trim() ||
        String(req.get('x-tracking-token') || '').trim();

      if (!hasValidTrackingToken(trackingToken, order.trackingAccessHash)) {
        res.status(404);
        return res.json({ message: 'Order not found' });
      }

      return res.json(sanitizeOrderForPublicTracking(order));
    }

    const { trackingAccessHash, ...safeOrder } = order;
    return res.json(safeOrder);
  } catch (error) {
    // Handle invalid MongoDB ObjectId
    if (error.name === 'CastError') {
      res.status(404);
      return res.json({ message: 'Order not found' });
    }
    next(error);
  }
};

// @desc    Get logged in user's orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res, next) => {
  try {
    const userIdCandidates = [String(req.user?._id || ''), String(req.user?.email || '')].filter(Boolean);
    const orders = await Order.find({
      $or: [
        { user: req.user._id },
        { userId: { $in: userIdCandidates } },
      ],
    })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders (paginated)
// @route   GET /api/orders?page=1&limit=50
// @access  Private/Admin
const getOrders = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      Order.countDocuments(),
    ]);

    res.json({
      orders,
      page,
      pages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res, next) => {
  try {
    const query = buildOrderLookupQuery(req.params.id);
    const order = query ? await Order.findOne(query) : null;
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const updatedOrder = await applyStatusAndTrackingUpdate({
      order,
      status: req.body.status,
      tracking: req.body.tracking,
    });
    res.json(updatedOrder);
  } catch (error) {
    if (
      String(error.message || '').startsWith('Invalid status') ||
      String(error.message || '').startsWith('Status cannot move backward') ||
      String(error.message || '').startsWith('Delivered orders cannot be cancelled')
    ) {
      res.status(400);
    }
    next(error);
  }
};

// @desc    Update order status by orderId in request body
// @route   POST /api/orders/update-order-status
// @access  Private/Admin
const updateOrderStatusByOrderId = async (req, res, next) => {
  try {
    const { orderId, status, tracking } = req.body || {};
    const query = buildOrderLookupQuery(orderId);
    const order = query ? await Order.findOne(query) : null;

    if (!order) {
      res.status(404);
      return res.json({ message: 'Order not found' });
    }

    const updatedOrder = await applyStatusAndTrackingUpdate({ order, status, tracking });
    res.json({ message: 'Order updated', order: updatedOrder });
  } catch (error) {
    if (
      String(error.message || '').startsWith('Invalid status') ||
      String(error.message || '').startsWith('Status cannot move backward') ||
      String(error.message || '').startsWith('Delivered orders cannot be cancelled')
    ) {
      res.status(400);
    }
    next(error);
  }
};

module.exports = {
  addOrderItems,
  getOrderById,
  getMyOrders,
  getOrders,
  updateOrderStatus,
  updateOrderStatusByOrderId
};
