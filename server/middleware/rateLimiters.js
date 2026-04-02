const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getUserIdFromRequest = (req) => {
  if (req?.user?._id) return String(req.user._id);
  if (req?.user?.id) return String(req.user.id);

  const authHeader = String(req.headers?.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return String(decoded?.userId || decoded?.id || '').trim() || null;
  } catch {
    return null;
  }
};

const keyByEmailOrIp = (req) => {
  const email = normalizeEmail(req.body?.email);
  return email || rateLimit.ipKeyGenerator(req.ip);
};

const keyByUserIdOrIp = (req) => {
  const userId = getUserIdFromRequest(req);
  return userId || rateLimit.ipKeyGenerator(req.ip);
};

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts' },
  keyGenerator: keyByEmailOrIp,
});

const otpLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: Number(process.env.OTP_RATE_LIMIT_MAX || 3),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP requests' },
  keyGenerator: keyByEmailOrIp,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again shortly.' },
  keyGenerator: keyByUserIdOrIp,
});

module.exports = {
  loginLimiter,
  otpLimiter,
  apiLimiter,
};
