const buckets = new Map();

export const createRateLimit = ({ windowMs = 60_000, max = 30, key = (req) => req.user?.id || req.ip, name = 'request' } = {}) => (
  (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${name}:${key(req) || 'unknown'}`;
    const recent = (buckets.get(bucketKey) || []).filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message: 'Rate limit exceeded', retry_after_seconds: retryAfter });
    }
    recent.push(now);
    buckets.set(bucketKey, recent);
    if (buckets.size > 10_000) {
      for (const [entryKey, timestamps] of buckets) if (!timestamps.some(timestamp => now - timestamp < windowMs)) buckets.delete(entryKey);
    }
    return next();
  }
);

export const clearRateLimitsForTest = () => buckets.clear();
