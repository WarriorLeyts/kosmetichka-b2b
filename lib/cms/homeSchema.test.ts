import { describe, expect, it } from "vitest";
import { DEFAULT_HOME, pageContentSchema, PRODUCT_SOURCES } from "./homeSchema";

describe("home page blocks: «Новые поступления»", () => {
  it("«Новинки» and «Снова в наличии» are sources of a products block", () => {
    expect(Object.keys(PRODUCT_SOURCES)).toEqual(expect.arrayContaining(["new", "back"]));
    const parsed = pageContentSchema.safeParse({
      version: 1,
      blocks: [{ id: "b", visible: true, type: "products", title: "Снова в наличии", source: "back", productIds: [], limit: 24, moreText: "", moreLink: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("the default home keeps both strips of the standard home", () => {
    const sources = DEFAULT_HOME.blocks.flatMap((b) => (b.type === "products" ? [b.source] : []));
    expect(sources).toEqual(["new", "back"]);
    expect(pageContentSchema.safeParse(DEFAULT_HOME).success).toBe(true);
  });
});
