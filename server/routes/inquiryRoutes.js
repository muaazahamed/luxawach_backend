const express = require('express');
const router = express.Router();
const {
  createInquiry,
  getInquiries,
  updateInquiryStatus
} = require('../controllers/inquiryController');
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.route('/')
  .post(createInquiry)
  .get(protect, adminMiddleware, getInquiries);

router.route('/:id/status').put(protect, adminMiddleware, updateInquiryStatus);

module.exports = router;
