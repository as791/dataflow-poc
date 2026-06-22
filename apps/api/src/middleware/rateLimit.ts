import type { RequestHandler, Request } from 'express';
import Redis from 'ioredis';

let redis: Redis | null = null;
function r(): Redis {
  if (!redis) redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return redis;
}

// Fixed-window rate limit per key. Resolution is seconds, not ms.
export function rateLimit(opts: {
  keyFn: (req: Request) => string;
  limit: number;
  windowSeconds: number;
  scope: string;
}): RequestHandler {
  return async (req, res, next) => {
    const key = `rl:${opts.scope}:${opts.keyFn(req)}`;
    try {
      const count = await r().incr(key);
      if (count === 1) await r().expire(key, opts.windowSeconds);
      if (count > opts.limit) return res.status(429).json({ error: 'rate limit exceeded' });
      next();
    } catch {
      // If Redis is down, fail open — losing rate limiting briefly is better
      // than blocking the whole app.
      next();
    }
  };
}

export const ipKey = (req: Request) => (req.ip ?? req.socket.remoteAddress ?? 'unknown');
