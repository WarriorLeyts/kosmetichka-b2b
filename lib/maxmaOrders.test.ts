import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn((a: unknown) => ({ op: "order.update", a })) },
  orderItem: { update: vi.fn((a: unknown) => ({ op: "orderItem.update", a })) },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const maxma = vi.hoisted(() => ({
  calcPromo: vi.fn(),
  setOrder: vi.fn(),
  cancelOrder: vi.fn(),
  confirmOrder: vi.fn(),
  maxmaConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/maxma", () => maxma);

import { promoWarning, recalcOrderPromo } from "./maxmaOrders";

const items = [
  { id: 1, productId: 10, productName: "Крем", price: 100, quantity: 2, total: 200, discount: 50 },
  { id: 2, productId: 11, productName: "Шампунь", price: 30, quantity: 1, total: 30, discount: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  maxma.maxmaConfigured.mockReturnValue(true);
  db.order.findUnique.mockResolvedValue({ id: 7, promoCode: "SALE", customer: { phone: "89001234567" }, items });
  db.product.findMany.mockResolvedValue([{ id: 10, guid: "g-10" }, { id: 11, guid: null }]);
});

describe("recalcOrderPromo", () => {
  it("returns null for orders without a promo code", async () => {
    db.order.findUnique.mockResolvedValue({ id: 7, promoCode: null, customer: null, items });
    expect(await recalcOrderPromo(7)).toBeNull();
    expect(maxma.calcPromo).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("applies the new calculation and re-registers the order", async () => {
    maxma.calcPromo.mockResolvedValue({ applied: true, discount: 46, lines: [40, 6] });
    const r = await recalcOrderPromo(7);
    expect(r).toEqual({ status: "applied", code: "SALE", discount: 46 });
    const lines = [
      { sku: "g-10", productName: "Крем", price: 100, quantity: 2, total: 200 },
      { sku: "11", productName: "Шампунь", price: 30, quantity: 1, total: 30 },
    ];
    expect(maxma.calcPromo).toHaveBeenCalledWith(lines, "SALE", "89001234567");
    expect(maxma.setOrder).toHaveBeenCalledWith(7, lines, "SALE", "89001234567");
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { discount: 40 } });
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { discount: 6 } });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { discount: 46, total: 184 } });
    expect(promoWarning(r)).toBeUndefined();
  });

  it("removes the promo when MAXMA no longer applies it", async () => {
    maxma.calcPromo.mockResolvedValue({ applied: false, error: "Минимальная сумма 500 ₽", discount: 0, lines: [0, 0] });
    const r = await recalcOrderPromo(7);
    expect(r).toEqual({ status: "removed", code: "SALE", discount: 0, reason: "Минимальная сумма 500 ₽" });
    expect(db.orderItem.update).toHaveBeenCalledTimes(1); // only the line that had a discount
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { discount: 0, total: 230, promoCode: null } });
    expect(maxma.cancelOrder).toHaveBeenCalledWith(7);
    expect(maxma.setOrder).not.toHaveBeenCalled();
    expect(promoWarning(r)).toBe("Промокод SALE больше не подходит: Минимальная сумма 500 ₽. Скидка снята.");
  });

  it("removes the promo when it gives no discount", async () => {
    maxma.calcPromo.mockResolvedValue({ applied: true, discount: 0, lines: [0, 0] });
    const r = await recalcOrderPromo(7);
    expect(r?.status).toBe("removed");
    expect(r?.reason).toBe("Промокод не подходит к этим товарам");
  });

  it("keeps capped discounts when MAXMA is unavailable", async () => {
    db.order.findUnique.mockResolvedValue({
      id: 7,
      promoCode: "SALE",
      customer: { phone: null },
      items: [{ ...items[0], quantity: 1, total: 100, discount: 150 }, items[1]],
    });
    maxma.calcPromo.mockRejectedValue(new Error("unavailable"));
    const r = await recalcOrderPromo(7);
    expect(r?.status).toBe("unchanged-error");
    expect(r?.discount).toBe(100);
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { discount: 100 } });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { discount: 100, total: 30 } });
    expect(maxma.cancelOrder).not.toHaveBeenCalled();
    expect(promoWarning(r)).toBeUndefined();
  });

  it("keeps capped discounts when MAXMA is not configured, and never throws", async () => {
    maxma.maxmaConfigured.mockReturnValue(false);
    expect((await recalcOrderPromo(7))?.status).toBe("unchanged-error");
    expect(maxma.calcPromo).not.toHaveBeenCalled();

    db.order.findUnique.mockRejectedValue(new Error("db down"));
    expect((await recalcOrderPromo(7))?.status).toBe("unchanged-error");
  });

  it("does not fail when set-order fails", async () => {
    maxma.calcPromo.mockResolvedValue({ applied: true, discount: 46, lines: [40, 6] });
    maxma.setOrder.mockRejectedValue(new Error("unavailable"));
    expect((await recalcOrderPromo(7))?.status).toBe("applied");
  });
});
