import { describe, expect, it } from "vitest";
import { catalogPhotoWhere, hasCatalogPhoto } from "../scripts/catalog-visibility.js";

describe("photo-less nomenclature visibility", () => {
  it("requires a real attached path for customers and does not restrict verified staff", () => {
    expect(catalogPhotoWhere()).toEqual({ images: { some: { path: { not: "" } } } });
    expect(catalogPhotoWhere(true)).toEqual({});
    expect(hasCatalogPhoto({ images: [] })).toBe(false);
    expect(hasCatalogPhoto({ images: [{ path: "" }] })).toBe(false);
    expect(hasCatalogPhoto({ images: [{ path: "1c/cream.jpg" }] })).toBe(true);
  });
  it("becomes publicly visible after a photo is attached without changing product or order flags", () => {
    const product = { id: 1, hidden: false, images: [] as { path: string }[] };
    expect(hasCatalogPhoto(product)).toBe(false);
    product.images.push({ path: "1c/new-photo.jpg" });
    expect(hasCatalogPhoto(product)).toBe(true);
    expect(product.hidden).toBe(false);
  });
});
