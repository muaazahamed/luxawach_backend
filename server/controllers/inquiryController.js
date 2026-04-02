const Inquiry = require('../models/Inquiry');

// @desc    Create an inquiry
// @route   POST /api/inquiries
// @access  Public
const createInquiry = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    const inquiry = new Inquiry({
      name,
      email,
      subject,
      message,
    });

    const createdInquiry = await inquiry.save();
    res.status(201).json(createdInquiry);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all inquiries
// @route   GET /api/inquiries
// @access  Private/Admin
const getInquiries = async (req, res, next) => {
  try {
    const inquiries = await Inquiry.find({})
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
    res.json(inquiries);
  } catch (error) {
    next(error);
  }
};

// @desc    Update inquiry status
// @route   PUT /api/inquiries/:id/status
// @access  Private/Admin
const updateInquiryStatus = async (req, res, next) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);

    if (inquiry) {
      inquiry.status = req.body.status || inquiry.status;
      const updatedInquiry = await inquiry.save();
      res.json(updatedInquiry);
    } else {
      res.status(404);
      throw new Error('Inquiry not found');
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInquiry,
  getInquiries,
  updateInquiryStatus
};
