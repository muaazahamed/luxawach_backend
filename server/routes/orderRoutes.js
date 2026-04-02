const express = require('express');
const router = express.Router();
const {
  addOrderItems,
  getOrderById,
  getMyOrders,
  getOrders,
  updateOrderStatus,
  updateOrderStatusByOrderId
} = require('../controllers/orderController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.route('/')
  .post(optionalAuth, addOrderItems)
  .get(protect, adminMiddleware, getOrders);

router.route('/my').get(protect, getMyOrders);
router.route('/myorders').get(protect, getMyOrders);
router.route('/update-order-status').post(protect, adminMiddleware, updateOrderStatusByOrderId);
router.route('/:id').put(protect, adminMiddleware, updateOrderStatus).get(optionalAuth, getOrderById);
router.route('/:id/status').put(protect, adminMiddleware, updateOrderStatus);

module.exports = router;
