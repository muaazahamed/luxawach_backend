const NodeCache = require('node-cache');
const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 300;
const cache = new NodeCache({
  stdTTL: DEFAULT_TTL_SECONDS,
  checkperiod: 120,
  useClones: false,
});

const createApiCache = ({ ttl = DEFAULT_TTL_SECONDS, keyPrefix = 'api' } = {}) => {
  return (req, res, next) => {
    if (req.method !== 'GET' || req.query.cache === 'false') {
      return next();
    }

    const key = `${keyPrefix}:${req.originalUrl}`;
    const cachedEntry = cache.get(key);

    if (cachedEntry) {
      // ETag-based 304 support
      const clientETag = req.headers['if-none-match'];
      if (clientETag && clientETag === cachedEntry.etag) {
        res.set('X-Cache', 'HIT');
        return res.status(304).end();
      }

      res.set('X-Cache', 'HIT');
      res.set('ETag', cachedEntry.etag);
      return res.status(cachedEntry.statusCode).json(cachedEntry.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        // Generate ETag from serialized body
        const serialized = JSON.stringify(body);
        const etag = `"${crypto.createHash('md5').update(serialized).digest('hex')}"`;

        cache.set(
          key,
          {
            statusCode: res.statusCode,
            body,
            etag,
          },
          ttl
        );
        res.set('X-Cache', 'MISS');
        res.set('ETag', etag);
      }

      return originalJson(body);
    };

    return next();
  };
};

const invalidateCacheByPrefix = (keyPrefix) => {
  if (!keyPrefix) return 0;

  const keys = cache.keys().filter((key) => key.startsWith(`${keyPrefix}:`));
  if (!keys.length) return 0;

  return cache.del(keys);
};

module.exports = {
  createApiCache,
  invalidateCacheByPrefix,
};
