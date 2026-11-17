import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ settings: { newDays: 10, backDays: 10 }, rows: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { productArrival: { findMany: mock.rows } } }));
vi.mock("@/lib/arrivalSettings", async (original) => ({ ...await original<typeof import("./arrivalSettings")>(), getArrivalSettings: async () => mock.settings }));
beforeEach(() => { vi.resetModules(); mock.rows.mockReset(); mock.settings = { newDays: 10, backDays: 10 }; });
it("reclassifies card labels when the novelty period changes, without waiting for cached labels", async () => {
  const { arrivalLabels } = await import("./arrivals");
  mock.rows.mockResolvedValue([{ docDate: new Date(), firstReceiptAt: new Date(Date.now() - 40 * 86400_000), place: "shop", product: { id: 1, hidden: false, stock: 20, wholesaleStock: 8, images: [{ id: 1 }] } }]);
  expect((await arrivalLabels(false)).get(1)).toBe("back");
  await arrivalLabels(false);
  expect(mock.rows).toHaveBeenCalledTimes(1);
  mock.settings = { newDays: 60, backDays: 10 };
  expect((await arrivalLabels(false)).get(1)).toBe("new");
  expect(mock.rows).toHaveBeenCalledTimes(2);
  mock.settings = { newDays: 10, backDays: 10 };
  expect((await arrivalLabels(false)).get(1)).toBe("back");
});
