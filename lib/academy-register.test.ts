import { describe, expect, it } from "vitest";
import { checkRegistration } from "./academy-register";

const ok = { name: "Иванова Анна", position: "Продавец-консультант", store: "Парфюм 2", login: "anna.ivanova", password: "secret123" };

describe("checkRegistration", () => {
  it("принимает нормальные данные и чистит их", () => {
    const r = checkRegistration({ ...ok, name: "  Иванова   Анна ", position: " продавец-консультант ", store: " Парфюм 2 ", login: " Anna.Ivanova " });
    expect(r).toEqual({ ok: true, data: ok });
  });

  it.each([
    [{ ...ok, name: "Анна" }, "name"],
    [{ ...ok, name: "" }, "name"],
    [{ ...ok, position: "" }, "position"],
    [{ ...ok, store: " " }, "store"],
    [{ ...ok, store: "Левый магазин" }, "store"],
    [{ ...ok, login: "an" }, "login"],
    [{ ...ok, login: "анна" }, "login"],
    [{ ...ok, login: "anna ivanova" }, "login"],
    [{ ...ok, login: ".anna" }, "login"],
    [{ ...ok, password: "1234567" }, "password"],
    [{ ...ok, password: "Anna.Ivanova" }, "password"],
  ])("отклоняет %j", (input, field) => {
    const r = checkRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
  });

  it("не падает на мусоре", () => {
    expect(checkRegistration(null).ok).toBe(false);
    expect(checkRegistration({ name: 5, login: [], password: {} }).ok).toBe(false);
  });

  it("роль из запроса не принимается — её в результате просто нет", () => {
    const r = checkRegistration({ ...ok, role: "admin" });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(["login", "name", "password", "position", "store"]);
  });
});
