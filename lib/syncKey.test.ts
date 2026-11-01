import { describe, expect, it, vi } from "vitest";
import { insideDir, syncKeyOk } from "./syncKey";
import { guestStock } from "./utils";

describe("1C key and paths", () => {
  it("key: exact match only, no key on the server → nobody", () => {
    vi.stubEnv("SYNC_API_KEY", "secret-1");
    expect(syncKeyOk("secret-1")).toBe(true);
    expect(syncKeyOk("secret-2")).toBe(false);
    expect(syncKeyOk("secret")).toBe(false);
    expect(syncKeyOk(null)).toBe(false);
    vi.stubEnv("SYNC_API_KEY", "");
    expect(syncKeyOk("")).toBe(false);
    vi.unstubAllEnvs();
  });
  it("a sibling folder with the same prefix is not inside", () => {
    expect(insideDir("/data/1c", "/data/1c/import.xml")).toBe(true);
    expect(insideDir("/data/1c", "/data/1c-evil/x.xml")).toBe(false);
  });
});

describe("guest stock", () => {
  it("only the label is told", () => {
    expect([guestStock(0), guestStock(null), guestStock(-2), guestStock(3), guestStock(10), guestStock(57)]).toEqual([0, 0, 0, 10, 10, 9999]);
  });
});
