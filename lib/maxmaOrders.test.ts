import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn((a: unknown) => ({ op: "order.update", a })) },
  orderItem: { update: vi.fn((a: unknown) => ({ op: "orderItem.update", a })) },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const maxma = vi.hoisted(() => ({
  calcLoyalty: vi.fn(),
  maxmaConfigured: vi.fn(() => true),
  // the queued set-order payload: lines + options, enough to check what is sent
  setOrderQuery: vi.fn((lines: unknown, q: object) => ({ lines, ...q })),
}));
vi.mock("@/lib/maxma", async (orig) => ({ ...(await orig<typeof import("./maxma")>()), ...maxma }));

const queue = vi.hoisted(() => ({
  enqueueMaxmaTask: vi.fn(async () => {}),
  runOrderMaxmaTasks: vi.fn(async () => ({ ran: 0, ok: 0, failed: 0, skipped: 0 })),
}));
vi.mock("@/lib/maxmaQueue", () => queue);

import { adoptReservedBonuses, isMaxmaOrder, onOrderStatus, loyaltyResponse, loyaltyWarning, promoWarning, recalcOrderLoyalty } from "./maxmaOrders";

const items = [
  { id: 1, productId: 10, productName: "Крем", price: 100, quantity: 2, total: 200, discount: 50, bonusDiscount: 0 },
  { id: 2, productId: 11, productName: "Шампунь", price: 30, quantity: 1, total: 30, discount: 0, bonusDiscount: 0 },
];
const customer = { phone: "89001234567", loyaltyCard: null, priceType: "wholesale" };
const lines = [
  { sku: "g-10", productName: "Крем", price: 100, quantity: 2, total: 200 },
  { sku: "11", productName: "Шампунь", price: 30, quantity: 1, total: 30 },
];
const promoOrder = { id: 7, promoCode: "SALE", bonusesApplied: 0, bonusesCollected: 0, customer, items };

beforeEach(() => {
  vi.clearAllMocks();
  maxma.maxmaConfigured.mockReturnValue(true);
  db.order.findUnique.mockResolvedValue(promoOrder);
  db.product.findMany.mockResolvedValue([{ id: 10, guid: "g-10" }, { id: 11, guid: null }]);
});

describe("recalcOrderLoyalty — promo code", () => {
  it("returns null for orders without promo code and bonuses", async () => {
    db.order.findUnique.mockResolvedValue({ ...promoOrder, promoCode: null });
    expect(await recalcOrderLoyalty(7)).toBeNull();
    expect(maxma.calcLoyalty).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("applies the new calculation and re-registers the order", async () => {
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 46, lines: [40, 6] }, bonuses: null, bonusLines: [0, 0] });
    const r = await recalcOrderLoyalty(7);
    expect(r).toEqual({ promo: { status: "applied", code: "SALE", discount: 46 }, bonuses: null });
    expect(maxma.calcLoyalty).toHaveBeenCalledWith({ customer, lines, promocode: "SALE", applyBonuses: 0, spendAllowed: false });
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(7, "set", { lines, customer, promocode: "SALE", applyBonuses: 0 }, {});
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { discount: 40, bonusDiscount: 0 } });
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { discount: 6, bonusDiscount: 0 } });
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { discount: 46, bonusesApplied: 0, bonusesCollected: 0, total: 184 },
    });
    expect(promoWarning(r?.promo)).toBeUndefined();
    expect(loyaltyWarning(r)).toBeUndefined();
  });

  it("removes the promo when MAXMA no longer applies it and cancels the MAXMA order", async () => {
    maxma.calcLoyalty.mockResolvedValue({
      promo: { applied: false, error: "Минимальная сумма 500 ₽", discount: 0, lines: [0, 0] },
      bonuses: null,
      bonusLines: [0, 0],
    });
    const r = await recalcOrderLoyalty(7);
    expect(r?.promo).toEqual({ status: "removed", code: "SALE", discount: 0, reason: "Минимальная сумма 500 ₽" });
    expect(db.orderItem.update).toHaveBeenCalledTimes(1); // only the line that had a discount
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { discount: 0, bonusesApplied: 0, bonusesCollected: 0, total: 230, promoCode: null },
    });
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledTimes(1);
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(7, "cancel");
    expect(promoWarning(r?.promo)).toBe("Промокод SALE больше не подходит: Минимальная сумма 500 ₽. Скидка снята.");
  });

  it("removes the promo when it gives no discount", async () => {
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 0, lines: [0, 0] }, bonuses: null, bonusLines: [0, 0] });
    const r = await recalcOrderLoyalty(7);
    expect(r?.promo?.status).toBe("removed");
    expect(r?.promo?.reason).toBe("Промокод не подходит к этим товарам");
  });

  it("keeps capped discounts when MAXMA is unavailable", async () => {
    db.order.findUnique.mockResolvedValue({
      ...promoOrder,
      items: [{ ...items[0], quantity: 1, total: 100, discount: 150 }, items[1]],
    });
    maxma.calcLoyalty.mockRejectedValue(new Error("unavailable"));
    const r = await recalcOrderLoyalty(7);
    expect(r?.promo?.status).toBe("unchanged-error");
    expect(r?.promo?.discount).toBe(100);
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { discount: 100, bonusDiscount: 0 } });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { discount: 100, bonusesApplied: 0, total: 30 } });
    // MAXMA follows later through the queue (no immediate attempt: it just failed), never cancelled
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledTimes(1);
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(
      7,
      "set",
      { lines: [{ ...lines[0], quantity: 1, total: 100 }, lines[1]], customer, promocode: "SALE", applyBonuses: 0 },
      { run: false }
    );
    expect(promoWarning(r?.promo)).toBeUndefined();
  });

  it("keeps capped discounts when MAXMA is not configured, and never throws", async () => {
    maxma.maxmaConfigured.mockReturnValue(false);
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("unchanged-error");
    expect(maxma.calcLoyalty).not.toHaveBeenCalled();
    expect(queue.enqueueMaxmaTask).not.toHaveBeenCalled();

    db.order.findUnique.mockRejectedValue(new Error("db down"));
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("unchanged-error");
  });

  it("does not fail when the queue fails", async () => {
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 46, lines: [40, 6] }, bonuses: null, bonusLines: [0, 0] });
    queue.enqueueMaxmaTask.mockRejectedValueOnce(new Error("db down"));
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("unchanged-error");
  });
});

describe("recalcOrderLoyalty — bonuses", () => {
  const cardCustomer = { phone: "89001234567", loyaltyCard: "2000123", priceType: "retail" };
  const bonusOrder = {
    id: 8,
    promoCode: null,
    bonusesApplied: 100,
    bonusesCollected: 5,
    customer: cardCustomer,
    items: [
      { ...items[0], discount: 0, bonusDiscount: 87 },
      { ...items[1], discount: 0, bonusDiscount: 13 },
    ],
  };

  it("keeps the spent amount as the request and lowers it when MAXMA allows less", async () => {
    db.order.findUnique.mockResolvedValue(bonusOrder);
    maxma.calcLoyalty.mockResolvedValue({
      promo: null,
      bonuses: { balance: 300, maxToApply: 60, applied: 60, collected: 4 },
      bonusLines: [52, 8],
    });
    const r = await recalcOrderLoyalty(8);
    expect(maxma.calcLoyalty).toHaveBeenCalledWith({
      customer: cardCustomer,
      lines,
      promocode: null,
      applyBonuses: 100,
      spendAllowed: true,
    });
    expect(r).toEqual({ promo: null, bonuses: { status: "applied", applied: 60, previous: 100, collected: 4 } });
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { discount: 0, bonusesApplied: 60, bonusesCollected: 4, total: 170 },
    });
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(8, "set", { lines, customer: cardCustomer, promocode: null, applyBonuses: 60 }, {});
    expect(loyaltyWarning(r)).toBe("Списание бонусов уменьшено до 60, потому что изменился состав заказа.");
    expect(loyaltyResponse(r)).toMatchObject({ promo: null, loyalty: r!.bonuses, loyaltyWarning: loyaltyWarning(r) });
  });

  it("keeps previous bonus discounts (capped) when MAXMA is unavailable", async () => {
    db.order.findUnique.mockResolvedValue({
      ...bonusOrder,
      items: [{ ...bonusOrder.items[0], quantity: 1, total: 50 }, bonusOrder.items[1]],
    });
    maxma.calcLoyalty.mockRejectedValue(new Error("unavailable"));
    const r = await recalcOrderLoyalty(8);
    expect(r?.bonuses).toEqual({ status: "unchanged-error", applied: 63, previous: 100, collected: 5 });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { discount: 0, bonusesApplied: 63, total: 17 } });
    // MAXMA still reserves 100: queued set-order with the kept 63 fixes it when MAXMA is back
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(8, "set", expect.objectContaining({ applyBonuses: 63 }), { run: false });
  });

  it("accrual-only order: re-registers with the new accrual, no warning", async () => {
    db.order.findUnique.mockResolvedValue({ ...bonusOrder, bonusesApplied: 0, items });
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 0, maxToApply: 0, applied: 0, collected: 7 }, bonusLines: [0, 0] });
    const r = await recalcOrderLoyalty(8);
    expect(r?.bonuses).toEqual({ status: "applied", applied: 0, previous: 0, collected: 7 });
    expect(maxma.calcLoyalty).toHaveBeenCalledWith(expect.objectContaining({ applyBonuses: 0, spendAllowed: false }));
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(8, "set", expect.objectContaining({ applyBonuses: 0 }), {});
    expect(loyaltyWarning(r)).toBeUndefined();
  });
});

describe("isMaxmaOrder", () => {
  it("is true for promo, spent or expected bonuses", () => {
    expect(isMaxmaOrder({ promoCode: null, bonusesApplied: 0, bonusesCollected: 0 })).toBe(false);
    expect(isMaxmaOrder({ promoCode: "X", bonusesApplied: 0, bonusesCollected: 0 })).toBe(true);
    expect(isMaxmaOrder({ promoCode: null, bonusesApplied: 5, bonusesCollected: 0 })).toBe(true);
    expect(isMaxmaOrder({ promoCode: null, bonusesApplied: 0, bonusesCollected: 3 })).toBe(true);
  });
});

describe("onOrderStatus (through the queue)", () => {
  beforeEach(() => {
    db.order.findMany.mockResolvedValue([{ id: 3 }, { id: 4 }]);
  });

  it("queues confirm for exported orders, then runs them", async () => {
    await onOrderStatus([3, 4, 5], "exported");
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(3, "confirm", null, { run: false });
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(4, "confirm", null, { run: false });
    expect(queue.runOrderMaxmaTasks).toHaveBeenCalledWith(3);
    expect(queue.runOrderMaxmaTasks).toHaveBeenCalledWith(4);
  });

  it("queues cancel for cancelled orders; ignores other statuses; never throws", async () => {
    await onOrderStatus(3, "cancelled", { background: true });
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(3, "cancel", null, { run: false });
    vi.clearAllMocks();
    await onOrderStatus(3, "assembly");
    expect(queue.enqueueMaxmaTask).not.toHaveBeenCalled();
    db.order.findMany.mockRejectedValue(new Error("db down"));
    await expect(onOrderStatus(3, "exported")).resolves.toBeUndefined();
  });
});

describe("adoptReservedBonuses (set-order reserved another amount)", () => {
  const base = { requested: 100, lineTotals: [200, 30], promoLines: [0, 0] };
  it("re-splits MAXMA's amount by its rows", () => {
    expect(adoptReservedBonuses({ ...base, reserved: 60, bonusRows: [52.5, 7.5] })).toEqual({ applied: 60, lines: [53, 7] });
  });
  it("0 reserved → no bonus discount", () => {
    expect(adoptReservedBonuses({ ...base, reserved: 0, bonusRows: [] })).toEqual({ applied: 0, lines: [0, 0] });
  });
  it("refuses more than the customer asked for, or what doesn't fit the lines", () => {
    expect(adoptReservedBonuses({ ...base, reserved: 120, bonusRows: [100, 20] })).toBeNull();
    expect(adoptReservedBonuses({ ...base, requested: 300, lineTotals: [50, 30], reserved: 90, bonusRows: [60, 30] })).toBeNull();
  });
});
