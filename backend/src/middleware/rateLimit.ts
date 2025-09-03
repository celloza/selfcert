import { Request, Response, NextFunction } from 'express';

interface LimiterOptions {
  windowMs: number; // rolling window size
  max: number; // max actions per window
  keyFn?: (req: Request) => string; // derive key (user)
  action: string; // label for headers & errors
}

interface HitRecord { ts: number; }

// Simple in-memory sliding window rate limiter (not distributed)
export function createRateLimiter(opts: LimiterOptions) {
  const store = new Map<string, HitRecord[]>();
  const windowMs = opts.windowMs;
  const max = opts.max;
  const keyFn = opts.keyFn || (req => (req as any).user?.sub || 'anonymous');
  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req);
    const now = Date.now();
    let hits = store.get(key) || [];
    // prune old
    hits = hits.filter(h => now - h.ts < windowMs);
    if (hits.length >= max) {
      const retryAfterMs = windowMs - (now - hits[0].ts);
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', (Date.now() + retryAfterMs).toString());
      return res.status(429).json({ error: `${opts.action} rate limit exceeded` });
    }
    hits.push({ ts: now });
    store.set(key, hits);
    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', (max - hits.length).toString());
    res.setHeader('X-RateLimit-Reset', (hits[0].ts + windowMs).toString());
    next();
  };
}
