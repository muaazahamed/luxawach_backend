const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const adminMiddleware = (req, res, next) => {
  if (!ADMIN_EMAIL) {
    return res.status(500).json({ message: 'Admin configuration is missing' });
  }

  if (
    req.user &&
    req.user.role === 'admin' &&
    String(req.user.email || '').trim().toLowerCase() === ADMIN_EMAIL
  ) {
    return next();
  }

  return res.status(403).json({ message: 'Admin access required' });
};

module.exports = adminMiddleware;
