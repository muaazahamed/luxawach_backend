const express = require('express');
const passport = require('passport');
const router = express.Router();
const { loginLimiter, otpLimiter } = require('../middleware/rateLimiters');
const {
  authUser,
  registerUser,
  sendSignupOtp,
  verifySignupOtp,
  sendForgotPasswordOtp,
  resetPasswordWithOtp,
  createAuthPayload,
} = require('../controllers/authController');
const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.post('/login', loginLimiter, authUser);
router.post('/register', registerUser);
router.post('/send-otp', otpLimiter, sendSignupOtp);
router.post('/verify-otp', otpLimiter, verifySignupOtp);
router.post('/forgot-password/send-otp', otpLimiter, sendForgotPasswordOtp);
router.post('/forgot-password/reset', resetPasswordWithOtp);
if (googleOAuthEnabled) {
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
      session: false,
    })
  );
  router.get(
    '/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    (req, res) => {
      const payload = createAuthPayload(req.user);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendURL}/dashboard?token=${encodeURIComponent(payload.token)}`);
    }
  );
} else {
  router.get('/google', (_req, res) => {
    return res.status(503).json({ message: 'Google OAuth is not configured' });
  });
}

module.exports = router;
