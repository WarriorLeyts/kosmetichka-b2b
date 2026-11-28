import { beforeEach, expect, it, vi } from "vitest";
import { getCatalogMetaMemo, setCatalogMetaMemo, invalidateCatalogMeta } from "./catalogMetaCache";
beforeEach(() => { invalidateCatalogMeta(); vi.restoreAllMocks(); });
it("never reuses staff metadata for a customer or guest", () => {
  setCatalogMetaMemo({ brands: ["Private brand"] }, "staff");
  expect(getCatalogMetaMemo()).toBeNull();
  setCatalogMetaMemo({ brands: ["Public brand"] });
  expect(getCatalogMetaMemo()).toEqual({ brands: ["Public brand"] });
  expect(getCatalogMetaMemo("staff")).toEqual({ brands: ["Private brand"] });
  invalidateCatalogMeta(); expect(getCatalogMetaMemo()).toBeNull(); expect(getCatalogMetaMemo("staff")).toBeNull();
});
it("expires both scopes after five minutes", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000); setCatalogMetaMemo({ brands: [] }, "staff");
  vi.spyOn(Date, "now").mockReturnValue(301001); expect(getCatalogMetaMemo("staff")).toBeNull();
});
