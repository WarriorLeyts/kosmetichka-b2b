import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
  productWarehouseStock: { findMany: vi.fn() },
}));
const one = vi.hoisted(() => ({ created: [] as Record<string, unknown>[] }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/maxmaOrders", () => ({ MAXMA_ORDER_WHERE: {}, onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("../scripts/onec-orders.js", async (orig) => {
  const real = await orig<typeof import("../scripts/onec-orders.js")>();
  return {
    ...real,
    loadOrder: async () => ({
      id: 241,
      createdAt: new Date("2026-11-09T08:00:00Z"),
      comment: "",
      customer: { priceType: "wholesale", name: "ИП" },
      items: [
        { id: 1, productId: 10, guid: "g-sh", quantity: 10, price: 100, total: 1000, discount: 0, bonusDiscount: 0, productName: "Шампунь" },
        { id: 2, productId: 20, guid: "g-cr", quantity: 4, price: 50, total: 200, discount: 0, bonusDiscount: 0, productName: "Крем", warehouseQty: null },
      ],
    }),
    prepareOrder: async () => ({ problems: [], counterpartyRef: "c", ctx: { template: { СтруктурнаяЕдиницаРезерв_Key: "tpl" }, counterpartyRef: "c", contractRef: "k", units: new Map() } }),
    findOrderDoc: async () => null,
    createOrderDoc: async (body: Record<string, unknown>) => {
      one.created.push(body);
      return { Ref_Key: "ref-" + body.Number, Number: body.Number };
    },
  };
});

import { sendOrderTo1C } from "./onecOrders";
import { SHOP_WAREHOUSE, STOCK_WAREHOUSE } from "./orderWarehouses";

beforeEach(() => {
  one.created = [];
  process.env.ORDERS_TO_1C = "odata";
  process.env.ODATA_BASE_URL = "x";
  process.env.ODATA_USER = "u";
  process.env.ODATA_PASSWORD = "p";
});

describe("a wholesale order goes to 1С as two documents", () => {
  it("shampoo: shop 11 → from the warehouse (СК-); cream: shop 40 → from the shop (СА-)", async () => {
    db.productWarehouseStock.findMany.mockResolvedValue([
      { qty: 11, warehouseGuid: SHOP_WAREHOUSE, product: { id: 10 } },
      { qty: 32, warehouseGuid: STOCK_WAREHOUSE, product: { id: 10 } },
      { qty: 40, warehouseGuid: SHOP_WAREHOUSE, product: { id: 20 } },
    ]);
    expect(await sendOrderTo1C(241)).toBe("created");
    expect(one.created.map((b) => b.Number)).toEqual(["СА-000241", "СК-000241"]);
    const [shop, stock] = one.created as { СтруктурнаяЕдиницаРезерв_Key: string; Запасы: { Номенклатура: string; Количество: number; Сумма: number }[] }[];
    expect(shop.СтруктурнаяЕдиницаРезерв_Key).toBe(SHOP_WAREHOUSE);
    expect(shop.Запасы.map((l) => [l.Номенклатура, l.Количество])).toEqual([["g-cr", 4]]);
    expect(stock.СтруктурнаяЕдиницаРезерв_Key).toBe(STOCK_WAREHOUSE);
    expect(stock.Запасы.map((l) => [l.Номенклатура, l.Количество, l.Сумма])).toEqual([["g-sh", 10, 1000]]);
  });
});
