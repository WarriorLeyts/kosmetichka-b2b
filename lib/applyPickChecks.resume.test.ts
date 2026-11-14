import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: number; quantity: number; price: number; total: number; check: { status: string; availableQty: number | null; note: string | null } | null };
const state = vi.hoisted(() => ({ items: [] as Item[] }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(async () => ({ id: 7, items: structuredClone(state.items) })), update: vi.fn(async () => ({})) },
  orderItem: {
    findMany: vi.fn(async () => structuredClone(state.items)),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) => { state.items = state.items.filter((i) => !where.id.in.includes(i.id)); }),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<Item> }) => Object.assign(state.items.find((i) => i.id === where.id)!, data)),
  },
  orderItemCheck: {
    deleteMany: vi.fn(async () => ({})),
    update: vi.fn(async ({ where, data }: { where: { orderItemId: number }; data: object }) => Object.assign(state.items.find((i) => i.id === where.orderItemId)!.check!, data)),
  },
  orderItemPhoto: { deleteMany: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/maxmaOrders", () => ({ isMaxmaOrder: () => false, recalcOrderLoyalty: vi.fn() }));
vi.mock("@/lib/orderTier", () => ({ repriceOrder: vi.fn(async () => null) }));
vi.mock("@/lib/orderChanges", () => ({ logOrderChanges: vi.fn(async () => []), changeChatMessage: vi.fn() }));
import { applyPickChecks } from "./applyPickChecks";
const apply = () => applyPickChecks(7, { id: 1, name: "Менеджер" });

beforeEach(() => { vi.clearAllMocks(); state.items = Array.from({ length: 148 }, (_, n) => ({ id: n + 1, quantity: 5, price: 100, total: 500, check: { status: "ok", availableQty: null, note: null } })); });

describe("continuing a collected order", () => {
  it("148 checked lines plus one new product: only the new product has no check", async () => {
    await apply();
    state.items.push({ id: 149, quantity: 1, price: 100, total: 100, check: null });
    expect(state.items.filter((i) => i.check)).toHaveLength(148);
    expect(state.items.filter((i) => !i.check).map((i) => i.id)).toEqual([149]);
    await apply();
    expect(state.items.filter((i) => i.check)).toHaveLength(148);
    expect(db.orderItemCheck.deleteMany).not.toHaveBeenCalled();
  });
  it("short and spoiled pieces are taken out once; remaining pieces stay checked", async () => {
    state.items[0].check = { status: '[{"s":"expired","q":2}]', availableQty: null, note: "Фото брака сохранено" };
    state.items[1].check = { status: '["insufficient_qty"]', availableQty: 2, note: null };
    state.items[2].check = { status: '["out_of_stock"]', availableQty: null, note: null };
    await apply();
    expect(state.items).toHaveLength(147);
    expect(state.items[0]).toMatchObject({ quantity: 3, check: { status: "ok", availableQty: null, note: "Фото брака сохранено" } });
    expect(state.items[1]).toMatchObject({ quantity: 2, check: { status: "ok" } });
    await apply();
    expect(state.items).toHaveLength(147);
    expect(state.items[0].quantity).toBe(3);
    expect(state.items[1].quantity).toBe(2);
    expect(state.items.every((i) => i.check?.status === "ok")).toBe(true);
    expect(db.orderItem.update).toHaveBeenCalledTimes(2);
  });
  it("an entirely unavailable order stays unchanged for replacement or cancellation", async () => {
    state.items.forEach((i) => { i.check!.status = "out_of_stock"; });
    expect((await apply()).emptied).toBe(true);
    expect(state.items).toHaveLength(148);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
