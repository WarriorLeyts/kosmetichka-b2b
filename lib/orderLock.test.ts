import { describe, expect, it } from "vitest";
import { withOrderLock } from "./orderLock";

describe("withOrderLock", () => {
  it("runs changes of one order one after another", async () => {
    const log: string[] = [];
    const slow = (tag: string, ms: number) => withOrderLock(7, async () => {
      log.push(tag + ">");
      await new Promise((r) => setTimeout(r, ms));
      log.push("<" + tag);
    });
    await Promise.all([slow("a", 30), slow("b", 1), slow("c", 1)]);
    expect(log).toEqual(["a>", "<a", "b>", "<b", "c>", "<c"]);
  });
  it("other orders are not held up, and an error releases the lock", async () => {
    const log: string[] = [];
    const a = withOrderLock(1, async () => { await new Promise((r) => setTimeout(r, 30)); log.push("1"); });
    const b = withOrderLock(2, async () => { log.push("2"); });
    await Promise.all([a, b]);
    expect(log).toEqual(["2", "1"]);
    await expect(withOrderLock(3, async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await withOrderLock(3, async () => "ok")).toBe("ok");
  });
});
