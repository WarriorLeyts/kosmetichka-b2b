vi.mock("@/lib/brandVisibility", () => ({ filterVisibleSnapshots: async (items: unknown[]) => items }));
/** Shared favourites: saved per customer, products cleaned and not repeated, guests refused. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ id: 7 as number | null }));
vi.mock("../_auth", () => ({ currentCustomerId: vi.fn(async () => who.id) }));
const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(async () => ({ priceType: "retail" })) },
  customerFavorites: {
    findUnique: vi.fn(),
    upsert: vi.fn(async (_a: { create: { items: unknown[] } }) => ({ updatedAt: new Date("2026-11-05T12:00:00Z") })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new Request("https://x/api/mobile/favorites", { method: "PUT", body: JSON.stringify(body) }));
const saved = () => (db.customerFavorites.upsert.mock.calls[0] as [{ create: { items: Record<string, unknown>[] } }])[0].create.items;

beforeEach(() => {
  vi.clearAllMocks();
  who.id = 7;
  db.customer.findUnique.mockResolvedValue({ priceType: "retail" });
});

describe("favorites", () => {
  it("empty for a customer without saved favourites", async () => {
    db.customerFavorites.findUnique.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ items: [], updatedAt: null });
  });

  it("saves cleaned products once each", async () => {
    const r = await put({ items: [{ id: 5, name: "Тонер", wholesalePrice: 1290, junk: "x" }, { id: 5, name: "again" }, { id: 0 }, { id: 6, images: [{ path: "a.jpg" }, { path: "b.jpg" }] }] });
    expect(r.status).toBe(200);
    expect(saved()).toEqual([{ id: 5, name: "Тонер", wholesalePrice: 1290 }, { id: 6, images: [{ path: "a.jpg" }] }]);
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

it("removes franchise snapshots from ordinary customer saves", async () => {
  await put({ items: [{ id: 5, cartKey: "5", quantity: 2, franchisePrice: 15, regularPrices: { franchisePrice: 15, retailPrice: 100 } }] });
  expect(saved()[0]).not.toHaveProperty("franchisePrice");
  expect(saved()[0].regularPrices).toEqual({ retailPrice: 100 });
});
it("keeps franchise snapshots only for a currently authorized franchise customer", async () => {
  db.customer.findUnique.mockResolvedValue({ priceType: "franchise" });
  await put({ items: [{ id: 5, cartKey: "5", quantity: 2, franchisePrice: 15, regularPrices: { franchisePrice: 15 } }] });
  expect(saved()[0].franchisePrice).toBe(15);
});
