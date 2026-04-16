const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const passport = require('passport');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { setupPassport } = require('./config/passport');
const { ensureAdminAccount } = require('./controllers/authController');
const { errorHandler } = require('./middleware/errorMiddleware');
const { apiLimiter } = require('./middleware/rateLimiters');

const validateSecurityConfig = () => {
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.OTP_SECRET) missing.push('OTP_SECRET');
  if (!process.env.ORDER_TRACKING_SECRET) missing.push('ORDER_TRACKING_SECRET');
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Missing required security env vars: ${missing.join(', ')}`);
  }

  if (String(process.env.OTP_SECRET).length < 32) {
    throw new Error('OTP_SECRET must be at least 32 characters');
  }
  if (String(process.env.ORDER_TRACKING_SECRET).length < 32) {
    throw new Error('ORDER_TRACKING_SECRET must be at least 32 characters');
  }
};

validateSecurityConfig();
setupPassport();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : DEFAULT_DEV_ORIGINS;

const corsOptions = {
  origin: (origin, callback) => {
    if (!process.env.CORS_ORIGIN && origin && localhostOriginPattern.test(origin)) {
      return callback(null, true);
    }
    if (!origin || configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  compression({
    threshold: 1024,
    level: 6,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      skip: (req) => req.path === '/health',
    })
  );
}

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;

  res.end = function patchedEnd(...args) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }

    if (durationMs > 1000) {
      console.warn(
        `[slow-request] ${req.method} ${req.originalUrl} ${durationMs.toFixed(2)}ms`
      );
    }

    return originalEnd.apply(this, args);
  };

  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(passport.initialize());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  });
});

app.get("/ping", (req, res) => {
  res.status(200).send("Server alive \u2705");
});

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/inquiries', require('./routes/inquiryRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/siteconfig', require('./routes/siteConfigRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));

const distPath = path.resolve(__dirname, '..', 'dist');
const distIndexPath = path.join(distPath, 'index.html');
const hasFrontendBuild = fs.existsSync(distIndexPath);

if (hasFrontendBuild) {
  app.use(
    express.static(distPath, {
      etag: true,
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    })
  );

  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }

    return res.sendFile(distIndexPath);
  });
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
const server = http.createServer(app);

server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 70000);

const startServer = async () => {
  try {
    await connectDB();
    await ensureAdminAccount();
  } catch (error) {
    if (String(error.message || '').includes('Admin account not found')) {
      console.error(`Admin bootstrap skipped: ${error.message}`);
    } else {
      console.error(`Startup failed: ${error.message}`);
      process.exit(1);
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!hasFrontendBuild) {
      console.warn(
        `Frontend build not found at ${distPath}. Run frontend build before single-deploy start.`
      );
    }
  });
};

startServer();

const shutdown = (signal) => {
  console.log(`${signal} received. Gracefully shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
