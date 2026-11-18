import { describe, expect, it, vi } from "vitest";
import { catalogFlightKey, shareCatalogRequest } from "./catalogRequestFlight";

describe("overlapping catalog requests", () => {
  it("runs one lookup for a burst but every caller can read its response", async () => {
    let finish!: (response: Response) => void;
    const lookup = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const requests = Array.from({ length: 7 }, () => shareCatalogRequest("burst", lookup));
    await Promise.resolve();
    expect(lookup).toHaveBeenCalledTimes(1);
    finish(Response.json({ products: [{ id: 7 }], stock: 3 }));
    const responses = await Promise.all(requests);
    responses[0].headers.set("x-test", "first");
    expect(responses[1].headers.has("x-test")).toBe(false);
    expect(await Promise.all(responses.map((r) => r.json()))).toEqual(Array(7).fill({ products: [{ id: 7 }], stock: 3 }));
    const fresh = vi.fn(async () => Response.json({ stock: 0 }));
    expect(await (await shareCatalogRequest("burst", fresh)).json()).toEqual({ stock: 0 });
    expect(fresh).toHaveBeenCalledOnce();
  });

  it("cleans up failed requests so retry performs a fresh lookup", async () => {
    const failure = vi.fn(async () => { throw new Error("database timeout"); });
    const results = await Promise.allSettled([shareCatalogRequest("failure", failure), shareCatalogRequest("failure", failure)]);
    expect(failure).toHaveBeenCalledOnce();
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect((await shareCatalogRequest("failure", async () => Response.json({ ok: true }))).status).toBe(200);
  });

  it("isolates guest, customer, staff, client pricing headers and different filters", () => {
    const req = new Request("https://site/api/catalog/products?search=cream");
    const keys = [
      catalogFlightKey(req), catalogFlightKey(req, "customer-one"), catalogFlightKey(req, "customer-two"),
      catalogFlightKey(req, "", "staff-one"), catalogFlightKey(req, "", "staff-two"),
      catalogFlightKey(new Request(req, { headers: { "x-kosmetichka-client": "web" } })),
      catalogFlightKey(new Request("https://site/api/catalog/products?search=soap")),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => /customer|staff|cream/.test(k))).toBe(false);
  });
});
