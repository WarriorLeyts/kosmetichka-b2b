import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rateLimit";

describe("RateLimiter", () => {
  it("limits within the window and forgets idle keys", () => {
    vi.useFakeTimers();
    const l = new RateLimiter({ windowMs: 1000, max: 2 });
    expect(l.check("a").ok).toBe(true);
    expect(l.check("a").ok).toBe(true);
    expect(l.check("a").ok).toBe(false);
    for (let i = 0; i < 50; i++) l.check("ip" + i);
    vi.advanceTimersByTime(1500);
    expect(l.check("b").ok).toBe(true); // the sweep runs here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((l as any).store.size).toBe(1);
    expect(l.check("a").ok).toBe(true);
    vi.useRealTimers();
  });
});
