import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  product: { groupBy: vi.fn() },
  brand: { findMany: vi.fn() },
  customer: { findUnique: vi.fn() },
  productPrice: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { GET } from "./route";

describe("catalog brand facets", () => {
  it("brands of the found products, the chosen brand ignored, most products first", async () => {
    db.product.groupBy.mockResolvedValue([
      { brandGuid: "p", _count: { _all: 18 } },
      { brandGuid: "h", _count: { _all: 24 } },
      { brandGuid: "x", _count: { _all: 3 } },
    ]);
    db.brand.findMany.mockResolvedValue([
      { guid: "p", name: "Pantene" },
      { guid: "h", name: "Head & Shoulders" },
      { guid: "x", name: "  " },
    ]);
    const res = await GET(new Request("http://x/api/catalog/products?facets=brand&search=шампунь&brandGuid=p"));
    const body = await res.json();
    expect(body.brands).toEqual([
      { guid: "h", name: "Head & Shoulders", count: 24 },
      { guid: "p", name: "Pantene", count: 18 },
    ]);
    const where = db.product.groupBy.mock.calls[0][0].where;
    expect(where.brandGuid).toEqual({ not: null });
    expect(where.AND).toBeTruthy(); // the search stays
  });
});
