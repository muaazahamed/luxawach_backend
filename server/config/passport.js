const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const crypto = require('crypto');
const User = require('../models/User');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const setupPassport = () => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL);

  if (!clientID || !clientSecret) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const verifiedEmail =
            profile.emails?.find((item) => item.verified)?.value ||
            profile.emails?.[0]?.value;
          const email = normalizeEmail(verifiedEmail);

          if (!email) return done(new Error('Google email not available'), null);

          let user = await User.findOne({ email });

          if (!user) {
            const randomPassword = crypto.randomBytes(32).toString('hex');
            user = await User.create({
              name: profile.displayName || 'Google User',
              email,
              password: randomPassword,
              role: 'user',
            });
          }

          // Only configured ADMIN_EMAIL may keep admin role.
          if (!ADMIN_EMAIL || email !== ADMIN_EMAIL) {
            if (user.role !== 'user') {
              user.role = 'user';
              await user.save();
            }
          } else if (user.role !== 'admin') {
            user.role = 'admin';
            await user.save();
          }

          // Defense in depth: ensure non-admin emails are never elevated.
          if (ADMIN_EMAIL && email !== ADMIN_EMAIL && user.role !== 'user') {
            user.role = 'user';
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

module.exports = { setupPassport };
