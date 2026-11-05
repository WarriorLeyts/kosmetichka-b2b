/** The shared cart: saved per customer, lines cleaned, guests refused. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ id: 7 as number | null }));
vi.mock("../_auth", () => ({ currentCustomerId: vi.fn(async () => who.id) }));
const db = vi.hoisted(() => ({
  customerCart: {
    findUnique: vi.fn(),
    upsert: vi.fn(async (_a: { create: { items: unknown[] } }) => ({ updatedAt: new Date("2026-11-05T12:00:00Z") })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new Request("https://x/api/mobile/cart", { method: "PUT", body: JSON.stringify(body) }));
const saved = () => (db.customerCart.upsert.mock.calls[0] as [{ create: { items: Record<string, unknown>[] } }])[0].create.items;

beforeEach(() => {
  vi.clearAllMocks();
  who.id = 7;
});

describe("cart", () => {
  it("empty for a customer without a saved cart", async () => {
    db.customerCart.findUnique.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ items: [], comment: "", updatedAt: null });
  });

  it("saves cleaned lines", async () => {
    const r = await put({ items: [{ id: 5, cartKey: "5", quantity: 3, name: "Тонер", wholesalePrice: 1290, junk: "x" }, { id: 0, cartKey: "bad", quantity: 1 }, { id: 6, cartKey: "6", quantity: 0 }], comment: "позвонить" });
    expect(r.status).toBe(200);
    expect(saved()).toEqual([{ id: 5, cartKey: "5", quantity: 3, name: "Тонер", wholesalePrice: 1290 }]);
  });

  it("guests can't", async () => {
    who.id = null;
    expect((await put({ items: [] })).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });

  it("needs a list", async () => {
    expect((await put({ items: "x" })).status).toBe(400);
  });
});
