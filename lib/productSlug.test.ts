import { describe, expect, it } from "vitest";
import { isValidSlug, parseProductParam, productPath, slugify } from "./productSlug";

describe("product slug", () => {
  it("transliterates", () => {
    expect(slugify("Шампунь для волос Fino 70мл/36")).toBe("shampun-dlya-volos-fino-70ml-36");
    expect(slugify("Тушь «Объём» — Ёж!")).toBe("tush-obem-ezh");
    expect(isValidSlug(slugify("Крем-краска Palette 6-68"))).toBe(true);
  });
  it("is at most 80 chars and doesn't cut a word", () => {
    const s = slugify("Очень длинное название товара ".repeat(10));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
  it("paths", () => {
    expect(productPath({ id: 12, slug: "fino" })).toBe("/product/12-fino");
    expect(productPath({ id: 12, slug: null })).toBe("/product/12");
    expect(parseProductParam("12-fino-70ml")).toEqual({ id: 12, slug: "fino-70ml" });
    expect(parseProductParam("12")).toEqual({ id: 12, slug: null });
    expect(parseProductParam("abc")).toBeNull();
    expect(parseProductParam("0")).toBeNull();
  });
});
