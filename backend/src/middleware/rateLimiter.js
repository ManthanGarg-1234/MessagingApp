// Simple high-performance token-bucket rate limiter middleware for production
const requestCounts = new Map();

export function createRateLimiter({ windowMs = 60000, maxRequests = 100, message = "Too many requests, please try again later." }) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "global";
    const now = Date.now();

    let record = requestCounts.get(ip);
    if (!record || now - record.startTime > windowMs) {
      record = { startTime: now, count: 1 };
      requestCounts.set(ip, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      res.setHeader("Retry-After", Math.ceil((record.startTime + windowMs - now) / 1000));
      return res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((record.startTime + windowMs - now) / 1000) });
    }

    next();
  };
}

// Clean up stale rate-limiting IP buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now - record.startTime > 300000) {
      requestCounts.delete(ip);
    }
  }
}, 300000);
