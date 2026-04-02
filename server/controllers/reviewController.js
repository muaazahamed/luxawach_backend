const Review = require('../models/Review');
const mongoose = require('mongoose');

const sanitizeText = (value) =>
  String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase());

// @desc    Create review
// @route   POST /api/reviews
// @access  Public (guest + logged-in)
const createReview = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      res.status(503);
      throw new Error('Reviews are temporarily unavailable. Please try again shortly.');
    }

    const comment = sanitizeText(req.body?.comment || req.body?.review);
    const rating = Number(req.body?.rating);

    if (!comment || !Number.isFinite(rating)) {
      res.status(400);
      throw new Error('Rating and comment are required');
    }
    if (rating < 1 || rating > 5) {
      res.status(400);
      throw new Error('Rating must be between 1 and 5');
    }
    if (comment.length < 10 || comment.length > 1000) {
      res.status(400);
      throw new Error('Comment must be between 10 and 1000 characters');
    }

    const authUser = req.user || null;
    const guestName = sanitizeText(req.body?.name);
    const guestEmail = sanitizeText(req.body?.email).toLowerCase();

    if (!authUser) {
      if (!guestName || guestName.length < 2 || guestName.length > 60) {
        res.status(400);
        throw new Error('Guest name must be between 2 and 60 characters');
      }
      if (!isValidEmail(guestEmail)) {
        res.status(400);
        throw new Error('Valid guest email is required');
      }
    }

    const createdReview = await Review.create({
      user: authUser?._id || null,
      guestName: authUser ? '' : guestName,
      guestEmail: authUser ? '' : guestEmail,
      rating: Math.round(rating),
      comment,
    });

    const populated = await createdReview.populate({ path: 'user', select: 'name' });

    return res.status(201).json({
      _id: populated._id,
      user: populated.user,
      name: populated.user?.name || populated.guestName || 'Guest',
      rating: populated.rating,
      comment: populated.comment,
      review: populated.comment,
      createdAt: populated.createdAt,
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get latest reviews
// @route   GET /api/reviews
// @access  Public
const getReviews = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const limitInput = Number(req.query?.limit);
    const limit = Number.isFinite(limitInput)
      ? Math.min(Math.max(Math.floor(limitInput), 1), 50)
      : 20;

    const reviews = await Review.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: 'user', select: 'name' })
      .select('-__v')
      .lean();

    const normalized = reviews.map((review) => ({
      ...review,
      name: review?.user?.name || review?.guestName || 'Guest',
      review: review?.comment || '',
    }));

    return res.json(normalized);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createReview,
  getReviews,
};
