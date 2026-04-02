const express = require('express');
const rateLimit = require('express-rate-limit');
const { createReview, getReviews } = require('../controllers/reviewController');
const { optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const reviewWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REVIEW_RATE_LIMIT_MAX || 6),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many review submissions. Please try again shortly.' },
});

router
  .route('/')
  .get(getReviews)
  .post(optionalAuth, reviewWriteLimiter, createReview);

module.exports = router;
