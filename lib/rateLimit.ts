/**
 * Lightweight in-memory sliding-window rate limiter.
 * Suitable for Next.js deployed as a single long-running Node.js process
 * (Amvera, Docker, etc.).  Not applicable for serverless/edge environments
 * where each invocation gets a fresh process.
 *
 * Usage:
 *   const limiter = new RateLimiter({ windowMs: 60_000, max: 5 });
 *   const result = limiter.check(key);
 *   if (!result.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

interface RateLimiterOptions {
  /** Rolling window duration in milliseconds */
  windowMs: number;
  /** Maximum number of hits allowed inside the window */
  max: number;
}

interface RateLimitResult {
  ok: boolean;
  /** How many hits have been recorded for this key in the current window */
  count: number;
  /** When the oldest hit in the current window will expire (ms since epoch) */
  resetAt: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  /** Map from key → sorted list of hit timestamps */
  private readonly store = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    const hits = (this.store.get(key) ?? []).filter((t) => t > cutoff);
    hits.push(now);
    this.store.set(key, hits);

    const ok = hits.length <= this.max;
    const resetAt = hits[0] + this.windowMs; // oldest hit + window = when slot frees

    return { ok, count: hits.length, resetAt };
  }

  /** Remove a key entirely (e.g. on successful action to reset limit) */
  reset(key: string): void {
    this.store.delete(key);
  }
}

// ── Named limiters ────────────────────────────────────────────────────────────

/** Order creation: max 10 orders per customer per hour */
export const orderCreationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
});

/** Customer message sending: max 30 messages per customer per 10 minutes */
export const messageLimiter = new RateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
});
