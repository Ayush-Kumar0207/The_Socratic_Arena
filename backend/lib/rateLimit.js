import crypto from 'crypto';
import { createClient } from 'redis';

const localBuckets = new Map();
let redisClient = null;
let redisConnection = null;
let lastRedisError = null;

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= maximum then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = math.max(1, window - (now - tonumber(oldest[2]))) end
  redis.call('PEXPIRE', key, window)
  return {0, count, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
`;

const localConsume = ({ bucketKey, max, windowMs, now = Date.now() }) => {
  const recent = (localBuckets.get(bucketKey) || []).filter(timestamp => now - timestamp < windowMs);
  if (recent.length >= max) {
    return {
      allowed: false,
      count: recent.length,
      retryAfterMs: Math.max(1, windowMs - (now - recent[0])),
      mode: 'process-local-fallback',
    };
  }
  recent.push(now);
  localBuckets.set(bucketKey, recent);
  if (localBuckets.size > 10_000) {
    for (const [entryKey, timestamps] of localBuckets) {
      if (!timestamps.some(timestamp => now - timestamp < windowMs)) localBuckets.delete(entryKey);
    }
  }
  return { allowed: true, count: recent.length, retryAfterMs: 0, mode: 'process-local-fallback' };
};

const getRedisClient = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (redisClient?.isReady) return redisClient;
  if (redisConnection) return redisConnection;

  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: retries => (retries >= 2 ? false : Math.min(250 * (retries + 1), 750)),
    },
  });
  redisClient.on('error', (error) => {
    lastRedisError = error.message;
    console.error('[Redis Rate Limit]', error.message);
  });
  redisConnection = redisClient.connect()
    .then(() => {
      lastRedisError = null;
      return redisClient;
    })
    .catch(async (error) => {
      lastRedisError = error.message;
      try { await redisClient?.close(); } catch {}
      redisClient = null;
      return null;
    })
    .finally(() => { redisConnection = null; });
  return redisConnection;
};

const redisConsume = async ({ bucketKey, max, windowMs, now = Date.now() }) => {
  const client = await getRedisClient();
  if (!client) return null;
  const result = await client.eval(SLIDING_WINDOW_SCRIPT, {
    keys: [`arena:rate-limit:${bucketKey}`],
    arguments: [String(now), String(windowMs), String(max), `${now}:${crypto.randomUUID()}`],
  });
  return {
    allowed: Number(result?.[0]) === 1,
    count: Number(result?.[1]) || 0,
    retryAfterMs: Number(result?.[2]) || 0,
    mode: 'redis-distributed',
  };
};

export const consumeRateLimit = async (options) => {
  if (process.env.REDIS_URL) {
    try {
      const distributed = await redisConsume(options);
      if (distributed) return distributed;
    } catch (error) {
      lastRedisError = error.message;
      console.error('[Redis Rate Limit] Falling back to process-local protection:', error.message);
    }
  }
  return localConsume(options);
};

export const createRateLimit = ({
  windowMs = 60_000,
  max = 30,
  key = req => req.user?.id || req.ip,
  name = 'request',
  consume = consumeRateLimit,
} = {}) => (
  async (req, res, next) => {
    try {
      const bucketKey = `${name}:${key(req) || 'unknown'}`;
      const result = await consume({ bucketKey, max, windowMs, now: Date.now() });
      res.set('X-RateLimit-Mode', result.mode);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - result.count)));
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ success: false, message: 'Rate limit exceeded', retry_after_seconds: retryAfter });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  }
);

export const ensureRateLimitReady = async () => {
  if (!process.env.REDIS_URL) return true;
  const client = await getRedisClient();
  if (!client?.isReady) return false;
  return client.ping().then(reply => reply === 'PONG').catch((error) => {
    lastRedisError = error.message;
    return false;
  });
};

export const rateLimitHealth = () => ({
  mode: process.env.REDIS_URL ? 'redis-distributed' : 'process-local',
  connected: process.env.REDIS_URL ? Boolean(redisClient?.isReady) : true,
  degraded: Boolean(lastRedisError),
});

export const clearRateLimitsForTest = () => localBuckets.clear();
