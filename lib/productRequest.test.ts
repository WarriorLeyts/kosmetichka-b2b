import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ product: { findUnique: vi.fn() } }));
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
