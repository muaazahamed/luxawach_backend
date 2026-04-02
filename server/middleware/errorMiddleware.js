const errorHandler = (err, req, res, next) => {
  // MongoDB CastError — e.g. invalid ObjectId in URL param → 404
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(404).json({
      message: 'Resource not found',
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }

  // Mongoose ValidationError — missing/invalid fields → 400
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      message: messages.join('. '),
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }

  // MongoDB duplicate key error (code 11000) → 409 Conflict
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(', ');
    return res.status(409).json({
      message: `Duplicate value for: ${field}`,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { errorHandler };
