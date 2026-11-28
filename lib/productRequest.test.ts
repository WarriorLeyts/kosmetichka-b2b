import { LEGACY_CAMPAIGN } from "@/lib/campaign";
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ product: { findUnique: vi.fn() }, orderItem: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { buildProductRequest } from "./productRequest";

const product = {
  id: 7,
  name: "Тонер Anua",
  prices: [
    { priceType: "retail", price: 1290 },
    { priceType: "wholesale", price: 727 },
  ],
  images: [{ path: "a/b.jpg" }],
  variants: [{ name: "Розовый", image: { path: "v/pink.jpg" } }],
};

beforeEach(() => db.product.findUnique.mockResolvedValue(product));

describe("«Добавить товар» card from the customer's chat", () => {
  it("built from the product: name, photo, the customer's price, quantity", async () => {
    expect(await buildProductRequest({ priceType: "wholesale" }, { productId: 7, quantity: 3 })).toEqual({
      _t: "product-request", id: 7, name: "Тонер Anua", variantName: null, imagePath: "a/b.jpg", quantity: 3, price: 727,
    });
  });
  it("a variant brings its own photo", async () => {
    const r = await buildProductRequest({ priceType: "retail" }, { productId: 7, quantity: 1, variantName: "Розовый" });
    expect(r).toMatchObject({ variantName: "Розовый", imagePath: "v/pink.jpg", price: 1290 });
  });
  it("refuses a wrong quantity, an unknown variant or product", async () => {
    expect(await buildProductRequest({}, { productId: 7, quantity: 0 })).toHaveProperty("error");
    expect(await buildProductRequest({}, { productId: 7, quantity: 1, variantName: "Синий" })).toHaveProperty("error");
    db.product.findUnique.mockResolvedValue(null);
    expect(await buildProductRequest({}, { productId: 9, quantity: 1 })).toHaveProperty("error");
  });
});

vi.mock("@/lib/campaignSettings", () => ({ getCampaign: async () => LEGACY_CAMPAIGN }));

it("does not disclose photo-less inventory through a forged chat product ID", async () => {
  db.product.findUnique.mockResolvedValue({ id: 42, name: "Без фото", prices: [], images: [], variants: [] });
  expect(await buildProductRequest({ priceType: "retail" }, { productId: 42, quantity: 2 })).toEqual({ error: "Товар не найден" });
  expect(db.orderItem.findFirst).not.toHaveBeenCalled();
  db.orderItem.findFirst.mockResolvedValue({ id: 1 });
  expect(await buildProductRequest({ priceType: "retail" }, { productId: 42, quantity: 2 }, 9)).toMatchObject({ id: 42, name: "Без фото", imagePath: null });
  expect(db.orderItem.findFirst).toHaveBeenCalledWith({ where: { orderId: 9, productId: 42 }, select: { id: true } });
});
