type Bucket = {
  count: number;
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  remaining: number;
  resetAt: number;
};

/**
 * Simple in-memory rate limiter scoped per Next.js edge/function instance.
 * Good enough for v1 where we only run a handful of concurrent instances.
 */
export function ensureRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(options.key);

  if (!existing || existing.expiresAt <= now) {
    const bucket: Bucket = {
      count: 1,
      expiresAt: now + options.windowMs,
    };
    buckets.set(options.key, bucket);
    return {
      remaining: Math.max(0, options.limit - 1),
      resetAt: bucket.expiresAt,
    };
  }

  if (existing.count >= options.limit) {
    throw new Error("rate_limit_exceeded");
  }

  existing.count += 1;
  return {
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.expiresAt,
  };
}

export function buildRateLimitKey(...parts: string[]): string {
  return parts.filter(Boolean).join(":");
}

/** Resets buckets between tests */
export function __resetRateLimiterForTests() {
  buckets.clear();
}

