const jwt = require('jsonwebtoken');
const User = require('../models/User');

// In-process cache for JWT-verified users: avoids a DB lookup on every authenticated request.
// Short TTL (60 s) means permission changes propagate within a minute.
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map(); // key: token → { user, expiresAt }

// Periodically prune expired entries (every 2 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userCache) {
    if (entry.expiresAt <= now) userCache.delete(key);
  }
}, 120_000).unref();

const unauthorized = (res, message) => {
  res.status(401).json({ message });
};

const resolveUserFromToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.userId || decoded.id;
  if (!userId) {
    return null;
  }

  const cached = userCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await User.findById(userId).select('-password').lean();
  if (!user) {
    return null;
  }

  userCache.set(token, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return user;
};

const extractBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  return token || null;
};

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = extractBearerToken(authHeader);

  if (!token) {
    return unauthorized(res, 'Not authorized, no token');
  }

  try {
    const user = await resolveUserFromToken(token);
    if (!user) {
      return unauthorized(res, 'Not authorized, token payload invalid');
    }

    req.user = user;
    return next();
  } catch (_error) {
    // Remove stale entry on auth failure
    userCache.delete(token);
    return unauthorized(res, 'Not authorized, token failed');
  }
};

const optionalAuth = async (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization || '');
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const user = await resolveUserFromToken(token);
    req.user = user || null;
  } catch (_error) {
    userCache.delete(token);
    req.user = null;
  }

  return next();
};

module.exports = { protect, optionalAuth };
