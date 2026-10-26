import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn((a: unknown) => ({ op: "order.update", a })) },
  orderItem: { update: vi.fn((a: unknown) => ({ op: "orderItem.update", a })) },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const maxma = vi.hoisted(() => ({
  calcLoyalty: vi.fn(),
  setLoyaltyOrder: vi.fn(async () => ({ applied: 0, collected: 0, anonymous: false })),
  cancelOrder: vi.fn(),
  confirmOrder: vi.fn(),
  maxmaConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/maxma", () => maxma);

import { isMaxmaOrder, loyaltyResponse, loyaltyWarning, promoWarning, recalcOrderLoyalty } from "./maxmaOrders";

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
  maxma.setLoyaltyOrder.mockResolvedValue({ applied: 0, collected: 0, anonymous: false });
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
    expect(maxma.setLoyaltyOrder).toHaveBeenCalledWith(7, lines, { customer, promocode: "SALE", applyBonuses: 0 });
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
    expect(maxma.cancelOrder).toHaveBeenCalledWith(7);
    expect(maxma.setLoyaltyOrder).not.toHaveBeenCalled();
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
    expect(maxma.cancelOrder).not.toHaveBeenCalled();
    expect(promoWarning(r?.promo)).toBeUndefined();
  });

  it("keeps capped discounts when MAXMA is not configured, and never throws", async () => {
    maxma.maxmaConfigured.mockReturnValue(false);
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("unchanged-error");
    expect(maxma.calcLoyalty).not.toHaveBeenCalled();

    db.order.findUnique.mockRejectedValue(new Error("db down"));
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("unchanged-error");
  });

  it("does not fail when set-order fails", async () => {
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 46, lines: [40, 6] }, bonuses: null, bonusLines: [0, 0] });
    maxma.setLoyaltyOrder.mockRejectedValue(new Error("unavailable"));
    expect((await recalcOrderLoyalty(7))?.promo?.status).toBe("applied");
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
    maxma.setLoyaltyOrder.mockResolvedValue({ applied: 60, collected: 4, anonymous: false });
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
    expect(maxma.setLoyaltyOrder).toHaveBeenCalledWith(8, lines, { customer: cardCustomer, promocode: null, applyBonuses: 60 });
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
    expect(maxma.setLoyaltyOrder).not.toHaveBeenCalled();
  });

  it("accrual-only order: re-registers with the new accrual, no warning", async () => {
    db.order.findUnique.mockResolvedValue({ ...bonusOrder, bonusesApplied: 0, items });
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 0, maxToApply: 0, applied: 0, collected: 7 }, bonusLines: [0, 0] });
    const r = await recalcOrderLoyalty(8);
    expect(r?.bonuses).toEqual({ status: "applied", applied: 0, previous: 0, collected: 7 });
    expect(maxma.calcLoyalty).toHaveBeenCalledWith(expect.objectContaining({ applyBonuses: 0, spendAllowed: false }));
    expect(maxma.setLoyaltyOrder).toHaveBeenCalled();
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
