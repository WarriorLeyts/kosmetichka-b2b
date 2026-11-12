import { beforeEach, describe, expect, it } from "vitest";
import { _resetOnce, once, requestIdOf } from "./idempotency";

describe("the same order request again", () => {
  beforeEach(() => _resetOnce());

  it("the first one runs, a repeat gets the first answer", () => {
    const a = once("7:abcdefgh", 1000);
    expect(a.kind).toBe("run");
    if (a.kind === "run") a.done(200, { orderId: 5 });
    expect(once("7:abcdefgh", 2000)).toEqual({ kind: "repeat", body: { orderId: 5 } });
  });

  it("while the first is running — busy", () => {
    once("7:abcdefgh", 1000);
    expect(once("7:abcdefgh", 1500).kind).toBe("busy");
  });

  it("an error is not remembered — the next try runs", () => {
    const a = once("7:abcdefgh", 1000);
    if (a.kind === "run") a.done(500, { error: "x" });
    expect(once("7:abcdefgh", 2000).kind).toBe("run");
  });

  it("forgotten after 10 minutes; other customers don't share ids", () => {
    const a = once("7:abcdefgh", 1000);
    if (a.kind === "run") a.done(200, { orderId: 5 });
    expect(once("8:abcdefgh", 2000).kind).toBe("run");
    expect(once("7:abcdefgh", 1000 + 11 * 60 * 1000).kind).toBe("run");
  });

  it("requestId: only a sane string", () => {
    expect(requestIdOf({ requestId: "a1b2c3d4-e5" })).toBe("a1b2c3d4-e5");
    expect(requestIdOf({ requestId: "short" })).toBeNull();
    expect(requestIdOf({ requestId: "<script>alert(1)</script>" })).toBeNull();
    expect(requestIdOf(null)).toBeNull();
  });
});
