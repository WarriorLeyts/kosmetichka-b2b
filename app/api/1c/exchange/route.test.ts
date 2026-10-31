import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn(), updateMany: vi.fn(async () => ({ count: 0 })) },
  product: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/syncRunner", () => ({ runSync: vi.fn() }));
vi.mock("@/lib/maxmaOrders", () => ({ MAXMA_ORDER_WHERE: {}, onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("@/lib/thumb", () => ({ dropThumbs: vi.fn() }));
vi.mock("@/lib/dataDir", () => ({ DATA_ROOT: "/tmp/kos-test-1c" }));
vi.stubEnv("SYNC_API_KEY", "k");

const { GET, POST } = await import("./route");
const auth = { Authorization: "Basic " + Buffer.from("1c:k").toString("base64") };
const req = (q: string, method = "GET", body?: string) => new NextRequest(`https://x.ru/api/1c/exchange?${q}`, { method, headers: auth, body });
const order = (id: number) => ({ id, createdAt: new Date(), total: 100, customer: { id: 1, name: "A", companyName: null, phone: null, oneCId: null, priceType: "wholesale" }, items: [], promoCode: null, priceTier: null, priceType: "wholesale", comment: null, deliveryType: null, deliveryAddress: null });

beforeEach(() => {
  db.order.findMany.mockReset().mockResolvedValue([]);
  db.order.updateMany.mockClear();
});

describe("1C sale exchange", () => {
  it("«success» without a list marks the orders of the last query", async () => {
    db.order.findMany.mockResolvedValueOnce([order(11), order(12)]);
    const xml = await (await GET(req("type=sale&mode=query"))).text();
    expect(xml).toContain("<Ид>11</Ид>");
    await GET(req("type=sale&mode=success"));
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: [11, 12] } }, data: expect.objectContaining({ status: "exported" }) });
  });

  it("a second «success» marks nothing again", async () => {
    await GET(req("type=sale&mode=success"));
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it("an explicit list in the body wins", async () => {
    await POST(req("type=sale&mode=success", "POST", "<Документ><Ид>7</Ид></Документ>"));
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: [7] } }, data: expect.objectContaining({ status: "exported" }) });
  });
});
