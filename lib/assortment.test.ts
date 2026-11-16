import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({ product: { findUnique: vi.fn(), update: vi.fn() }, productVariant: { update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } }));
const db = vi.hoisted(() => ({ product: { findUnique: vi.fn(), findMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: db }));
import { assortmentSchema, saveAssortment } from "./assortment";
import { priceOrder } from "./orderPricing";
import { aggregateAssortmentLines } from "../scripts/assortment-lines.js";
import { cmlComment } from "./commerceml";
import { cmlComment as commentJs } from "../scripts/onec-order-comment.js";
beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(fn => fn(tx)); db.product.findUnique.mockResolvedValue(null); });
describe("photo assortment", () => {
  it("rejects duplicate photo and ambiguous names", () => {
    expect(assortmentSchema.safeParse({ variants: [{ imageId: 1, name: "Роза" }, { imageId: 1, name: "Ваниль" }] }).success).toBe(false);
    expect(assortmentSchema.safeParse({ variants: [{ imageId: 1, name: "Роза" }, { imageId: 2, name: "роза" }] }).success).toBe(false);
  });
  it("rejects another product's photo before any mutation", async () => {
    tx.product.findUnique.mockResolvedValue({ id: 1, images: [{ id: 10 }], variants: [] });
    await expect(saveAssortment(1, { enabled: true, variants: [{ imageId: 99, name: "Роза", available: true }] })).rejects.toThrow("не принадлежит");
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it("keeps the ID of a renamed variant and its unavailable state", async () => {
    tx.product.findUnique.mockResolvedValue({ id: 1, images: [{ id: 10 }], variants: [{ id: 7, imageId: 10 }] });
    await saveAssortment(1, { enabled: true, variants: [{ imageId: 10, name: "Роза", available: false }] });
    expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { name: "Роза", available: false, sortOrder: 0 } });
    expect(tx.productVariant.create).not.toHaveBeenCalled();
  });
  const product = { id: 1, guid: "g1", name: "Ассорти", stock: 5, minOrderQty: 5, assortmentEnabled: true, prices: [{ priceType: "retail", price: 100 }], variants: [{ id: 7, name: "Роза", available: true, image: { path: "rose.jpg" } }, { id: 8, name: "Ваниль", available: true, image: { path: "vanilla.jpg" } }] };
  it("validates shared stock and minimum; snapshots names/photos from server by stable ID", async () => {
    db.product.findMany.mockResolvedValue([product]);
    const items = [{ id: 1, quantity: 2, variantId: 7, variantName: "forged", variantImageUrl: "forged" }, { id: 1, quantity: 3, variantId: 8 }];
    const priced = await priceOrder({ priceType: "retail" }, items);
    expect(priced.lines[0]).toMatchObject({ variantName: "Роза", variantImageUrl: "https://kosmetichka-opt.ru/api/1c/rose.jpg", quantity: 2 });
    await expect(priceOrder({ priceType: "retail" }, [{ ...items[0], quantity: 3 }, items[1]])).rejects.toThrow("в наличии 5");
    await expect(priceOrder({ priceType: "retail" }, [{ ...items[0], variantId: 99, quantity: 5 }])).rejects.toThrow("недоступен");
    db.product.findMany.mockResolvedValue([{ ...product, variants: product.variants.map(v => ({ ...v, available: false })) }]);
    await expect(priceOrder({ priceType: "retail" }, items)).rejects.toThrow("недоступен");
  });
  it("exports one nomenclature with exact totals and selected kinds in the comment", () => {
    const items = [{ productId: 1, productName: "Ассорти", variantName: "Роза", price: 100, quantity: 2, total: 200, discount: 10, bonusDiscount: 5 }, { productId: 1, productName: "Ассорти", variantName: "Ваниль", price: 100, quantity: 3, total: 300, discount: 20, bonusDiscount: 6 }];
    expect(aggregateAssortmentLines(items)).toEqual([expect.objectContaining({ quantity: 5, total: 500, discount: 30, bonusDiscount: 11 })]);
    expect(items[0].quantity).toBe(2);
    const order = { comment: "Позвонить", items, promoCode: "TEST", discount: 30, bonusesApplied: 11 };
    expect(cmlComment(order)).toContain("Роза — 2 шт.");
    expect(cmlComment(order)).toContain("Ваниль — 3 шт.");
    expect(commentJs(order)).toBe(cmlComment(order));
  });
});
