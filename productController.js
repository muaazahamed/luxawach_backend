const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const getAdminEmail = () => normalizeEmail(process.env.ADMIN_EMAIL);
const OTP_SECRET = String(process.env.OTP_SECRET || '');
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 45);
const signupOtpStore = new Map();
const forgotPasswordOtpStore = new Map();

const sanitizeUserResponse = (userDoc) => ({
  userId: String(userDoc._id),
  role: userDoc.role,
  token: generateToken(userDoc),
  _id: userDoc._id,
  name: userDoc.name,
  email: userDoc.email,
});

// Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { userId: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const createAuthPayload = (userDoc) => ({
  token: generateToken(userDoc),
  role: userDoc.role,
  userId: String(userDoc._id),
  name: userDoc.name,
  email: userDoc.email,
});

const hashOtp = (email, otp) => {
  if (!OTP_SECRET) {
    throw new Error('OTP_SECRET is required');
  }

  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}:${String(otp)}:${OTP_SECRET}`)
    .digest('hex');
};

const getOtpMailer = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
};

const createOtp = () =>
  otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
    digits: true,
  });

const setOtpState = (store, email, extra = {}) => {
  const otp = createOtp();
  const now = Date.now();
  const expiresAt = now + OTP_TTL_MINUTES * 60 * 1000;

  store.set(email, {
    otpHash: hashOtp(email, otp),
    expiresAt,
    attempts: 0,
    nextAllowedAt: now + OTP_RESEND_COOLDOWN_SECONDS * 1000,
    ...extra,
  });

  return { otp, expiresAt };
};

const ensureAdminAccount = async () => {
  const ADMIN_EMAIL = getAdminEmail();
  if (!ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL is not configured');
  }

  let configuredAdmin = await User.findOne({ email: ADMIN_EMAIL });
  if (!configuredAdmin) {
    throw new Error('Admin account not found. Create it through verified onboarding.');
  }

  configuredAdmin.role = 'admin';
  await configuredAdmin.save();

  await User.updateMany(
    { role: 'admin', email: { $ne: ADMIN_EMAIL } },
    { $set: { role: 'user' } }
  );

  return configuredAdmin;
};

// @desc    Auth user/admin & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const ADMIN_EMAIL = getAdminEmail();

    if (!email || !password) {
      res.status(400);
      throw new Error('Email and password are required');
    }

    await ensureAdminAccount();
    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error('Invalid email or password');
    }

    // Security: only predefined admin email may keep admin role.
    if (normalizeEmail(user.email) !== ADMIN_EMAIL && user.role !== 'user') {
      user.role = 'user';
      await user.save();
    }

    // Admin access is bound to the configured admin email.
    // Password validation is already handled by bcrypt above.
    if (user.role === 'admin') {
      const isConfiguredAdmin = normalizeEmail(user.email) === ADMIN_EMAIL;
      if (!isConfiguredAdmin) {
        res.status(401);
        throw new Error('Invalid admin credentials');
      }
    }

    user.loginCount = Number(user.loginCount || 0) + 1;
    user.lastLoginAt = new Date();
    await user.save();

    return res.json(sanitizeUserResponse(user));
  } catch (error) {
    return next(error);
  }
};

// @desc    Register a customer user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const ADMIN_EMAIL = getAdminEmail();

    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Name, email, and password are required');
    }
    if (password.length < 8) {
      res.status(400);
      throw new Error('Password must be at least 8 characters');
    }
    if (email === ADMIN_EMAIL) {
      res.status(400);
      throw new Error('This email is reserved');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(409);
      throw new Error('User already exists');
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'user',
    });

    return res.status(201).json(sanitizeUserResponse(user));
  } catch (error) {
    return next(error);
  }
};

// @desc    Send signup OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
const sendSignupOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim();
    const ADMIN_EMAIL = getAdminEmail();

    if (!email) {
      res.status(400);
      throw new Error('Email is required');
    }
    if (email === ADMIN_EMAIL) {
      res.status(400);
      throw new Error('This email is reserved');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409);
      throw new Error('User already exists');
    }

    const now = Date.now();
    const existingOtpState = signupOtpStore.get(email);
    if (existingOtpState && existingOtpState.nextAllowedAt > now) {
      const waitSeconds = Math.ceil((existingOtpState.nextAllowedAt - now) / 1000);
      res.status(429);
      throw new Error(`Please wait ${waitSeconds}s before requesting a new OTP`);
    }

    const mailer = getOtpMailer();
    if (!mailer) {
      res.status(500);
      throw new Error('Email service is not configured');
    }

    const { otp } = setOtpState(signupOtpStore, email, { name: name || null });

    await mailer.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Luxa Wach OTP Code',
      text: `Your OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    });

    return res.status(200).json({
      success: true,
      message: 'OTP sent',
      expiresInSeconds: OTP_TTL_MINUTES * 60,
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Verify OTP and create account
// @route   POST /api/auth/verify-otp
// @access  Public
const verifySignupOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const otp = String(req.body?.otp || '').trim();
    const providedName = String(req.body?.name || '').trim();
    const ADMIN_EMAIL = getAdminEmail();

    if (!email || !password || !otp) {
      res.status(400);
      throw new Error('Email, password, and OTP are required');
    }
    if (password.length < 8) {
      res.status(400);
      throw new Error('Password must be at least 8 characters');
    }
    if (email === ADMIN_EMAIL) {
      res.status(400);
      throw new Error('This email is reserved');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      signupOtpStore.delete(email);
      res.status(409);
      throw new Error('User already exists');
    }

    const otpState = signupOtpStore.get(email);
    if (!otpState) {
      res.status(400);
      throw new Error('OTP not found. Please request a new OTP');
    }

    if (Date.now() > otpState.expiresAt) {
      signupOtpStore.delete(email);
      res.status(400);
      throw new Error('OTP expired. Please request a new OTP');
    }

    const incomingOtpHash = hashOtp(email, otp);
    if (incomingOtpHash !== otpState.otpHash) {
      otpState.attempts += 1;
      if (otpState.attempts >= OTP_MAX_ATTEMPTS) {
        signupOtpStore.delete(email);
        res.status(429);
        throw new Error('Too many invalid OTP attempts. Request a new OTP');
      }
      signupOtpStore.set(email, otpState);
      res.status(400);
      throw new Error('Invalid OTP');
    }

    const fallbackName = email.split('@')[0] || 'User';
    const user = await User.create({
      name: providedName || otpState.name || fallbackName,
      email,
      password,
      role: 'user',
    });

    signupOtpStore.delete(email);

    return res.status(201).json({
      success: true,
      message: 'Account created',
      user: sanitizeUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Send forgot-password OTP
// @route   POST /api/auth/forgot-password/send-otp
// @access  Public
const sendForgotPasswordOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const ADMIN_EMAIL = getAdminEmail();
    if (!email) {
      res.status(400);
      throw new Error('Email is required');
    }

    const mailer = getOtpMailer();
    if (!mailer) {
      res.status(500);
      throw new Error('Email service is not configured');
    }
    const isAllowedEmail = email && email !== ADMIN_EMAIL;
    const user = isAllowedEmail ? await User.findOne({ email }) : null;

    if (user) {
      const now = Date.now();
      const existingOtpState = forgotPasswordOtpStore.get(email);
      if (!(existingOtpState && existingOtpState.nextAllowedAt > now)) {
        const { otp } = setOtpState(forgotPasswordOtpStore, email, {
          userId: String(user._id),
        });

        await mailer.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Your Luxa Wach Password Reset OTP',
          text: `Your password reset OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'If the account exists, an OTP has been sent',
      expiresInSeconds: OTP_TTL_MINUTES * 60,
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Verify forgot-password OTP and reset password
// @route   POST /api/auth/forgot-password/reset
// @access  Public
const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const ADMIN_EMAIL = getAdminEmail();

    if (!email || !otp || !newPassword) {
      res.status(400);
      throw new Error('Email, OTP, and new password are required');
    }
    if (newPassword.length < 8) {
      res.status(400);
      throw new Error('Password must be at least 8 characters');
    }
    if (email === ADMIN_EMAIL) {
      res.status(400);
      throw new Error('Invalid reset request');
    }

    const otpState = forgotPasswordOtpStore.get(email);
    if (!otpState) {
      res.status(400);
      throw new Error('OTP not found. Please request a new OTP');
    }

    if (Date.now() > otpState.expiresAt) {
      forgotPasswordOtpStore.delete(email);
      res.status(400);
      throw new Error('OTP expired. Please request a new OTP');
    }

    const incomingOtpHash = hashOtp(email, otp);
    if (incomingOtpHash !== otpState.otpHash) {
      otpState.attempts += 1;
      if (otpState.attempts >= OTP_MAX_ATTEMPTS) {
        forgotPasswordOtpStore.delete(email);
        res.status(429);
        throw new Error('Too many invalid OTP attempts. Request a new OTP');
      }
      forgotPasswordOtpStore.set(email, otpState);
      res.status(400);
      throw new Error('Invalid OTP');
    }

    const user = await User.findOne({ email });
    if (!user) {
      forgotPasswordOtpStore.delete(email);
      res.status(400);
      throw new Error('Invalid reset request');
    }

    user.password = newPassword;
    await user.save();

    forgotPasswordOtpStore.delete(email);

    return res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authUser,
  registerUser,
  sendSignupOtp,
  verifySignupOtp,
  sendForgotPasswordOtp,
  resetPasswordWithOtp,
  ensureAdminAccount,
  createAuthPayload,
};
