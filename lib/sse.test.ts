import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/realtime", () => ({ onLive: () => () => {} }));
import { liveStream } from "./sse";

describe("live streams per customer", () => {
  it("the 6th stream is refused; closing one frees a place", async () => {
    const ctrls = Array.from({ length: 6 }, () => new AbortController());
    const res = ctrls.map((c) => liveStream(new Request("https://x.ru/api/live", { signal: c.signal }), () => null, { key: "c1", max: 5 }));
    expect(res.slice(0, 5).every((r) => r.status === 200)).toBe(true);
    expect(res[5].status).toBe(429);
    expect(liveStream(new Request("https://x.ru/api/live"), () => null, { key: "c2", max: 5 }).status).toBe(200);
    ctrls[0].abort();
    await new Promise((r) => setTimeout(r, 0));
    expect(liveStream(new Request("https://x.ru/api/live"), () => null, { key: "c1", max: 5 }).status).toBe(200);
  });
});
