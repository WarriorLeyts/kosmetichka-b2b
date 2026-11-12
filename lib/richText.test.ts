import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseRich, RichText } from "./richText";

describe("text markup from the admin panel", () => {
  it("headings, lists, paragraphs", () => {
    expect(parseRich("## Доставка\nПо городу\nбесплатно\n\n- раз\n- два\n1. первый\n\nТекст")).toEqual([
      { type: "h2", text: "Доставка" },
      { type: "p", text: "По городу\nбесплатно" },
      { type: "ul", items: ["раз", "два"] },
      { type: "ol", items: ["первый"] },
      { type: "p", text: "Текст" },
    ]);
  });

  it("bold and safe links only; no HTML from the text", () => {
    const html = renderToStaticMarkup(RichText({ text: "**Важно** [сайт](https://a.ru) [x](javascript:alert(1)) <script>bad()</script> [о нас](/info/o-nas)" })!);
    expect(html).toContain("<strong>Важно</strong>");
    expect(html).toContain('href="https://a.ru"');
    expect(html).toContain('href="/info/o-nas"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
