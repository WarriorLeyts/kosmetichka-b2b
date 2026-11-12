import { describe, expect, it } from "vitest";
import { orderIdFromQuery, syncState } from "./orderSync";

const now = new Date("2026-11-12T12:00:00Z");
const base = { status: "payment", oneCExportedAt: null, oneCError: null, oneCSendingAt: null };

describe("order ↔ 1С state in the admin panel", () => {
  it("follows the fields lib/onecOrders.ts keeps", () => {
    expect(syncState({ ...base, status: "exported", oneCExportedAt: now }, now)).toBe("synced");
    expect(syncState({ ...base, status: "exported" }, now)).toBe("synced");
    expect(syncState({ ...base, status: "cancelled" }, now)).toBe("none");
    expect(syncState({ ...base, status: "pending" }, now)).toBe("waiting");
    expect(syncState({ ...base, status: "consultation" }, now)).toBe("waiting");
    expect(syncState(base, now)).toBe("pending");
    expect(syncState({ ...base, oneCError: "Покупатель не найден" }, now)).toBe("failed");
    // a running send wins over the old error; a claim older than 10 min is a dead sender
    expect(syncState({ ...base, oneCError: "x", oneCSendingAt: new Date(now.getTime() - 60_000) }, now)).toBe("sending");
    expect(syncState({ ...base, oneCError: "x", oneCSendingAt: new Date(now.getTime() - 11 * 60_000) }, now)).toBe("failed");
  });

  it("finds an order by its site or 1С number", () => {
    expect(orderIdFromQuery("231")).toBe(231);
    expect(orderIdFromQuery("№ 231")).toBe(231);
    expect(orderIdFromQuery("СА-000231")).toBe(231);
    expect(orderIdFromQuery("ск-000231")).toBe(231);
    expect(orderIdFromQuery("Диана")).toBe(null);
  });
});
