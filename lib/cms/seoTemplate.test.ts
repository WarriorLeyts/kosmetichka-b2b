import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, fitLength, lengthIssue, renderFit, renderTemplate, unknownVars } from "./seoTemplate";

describe("SEO templates", () => {
  it("fills variables", () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.title, { name: "Шампунь Fino" })).toBe("Шампунь Fino — купить оптом | Косметичка");
    expect(renderTemplate(DEFAULT_TEMPLATES.description, { name: "Шампунь", brand: "Fino" })).toBe(
      "Купить Шампунь бренда Fino оптом в интернет-магазине Косметичка. Актуальные цены и ассортимент."
    );
  });
  it("drops an optional part when its variable is empty", () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.description, { name: "Шампунь", brand: null })).toBe(
      "Купить Шампунь оптом в интернет-магазине Косметичка. Актуальные цены и ассортимент."
    );
    expect(renderTemplate("{brand} — {name}", { name: "Тушь" })).toBe("Тушь");
  });
  it("numbers, unknown vars, length", () => {
    expect(renderTemplate("от {price} ₽", { price: 1250 })).toBe("от 1 250 ₽");
    expect(unknownVars("{name} {nmae}")).toEqual(["nmae"]);
    expect(fitLength("один два три четыре", 12)).toBe("один два…");
    expect(lengthIssue("title", "")).toBe("пусто");
    expect(lengthIssue("description", "x".repeat(200))).toMatch(/длинный/);
    expect(lengthIssue("title", "Нормальный заголовок товара")).toBeNull();
  });
});

describe("renderFit", () => {
  it("shortens the name, keeps the template's tail", () => {
    const name = "Vivienne Sabo Устойчивая жидкая матовая помада для губ с плампингом и гиалуроном тон 05";
    const out = renderFit(DEFAULT_TEMPLATES.title, { name }, 70);
    expect(out.length).toBeLessThanOrEqual(70);
    expect(out.endsWith("— купить оптом | Косметичка")).toBe(true);
    expect(out).toMatch(/^Vivienne Sabo .*… — купить/);
  });
  it("short names unchanged", () => {
    expect(renderFit(DEFAULT_TEMPLATES.title, { name: "Тушь" }, 70)).toBe("Тушь — купить оптом | Косметичка");
  });
});
