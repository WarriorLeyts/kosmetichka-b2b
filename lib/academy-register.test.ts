import { describe, expect, it } from "vitest";
import { checkRegistration } from "./academy-register";

const ok = { name: "Иванова Анна", login: "anna.ivanova", password: "secret123" };

describe("checkRegistration", () => {
  it("принимает нормальные данные и чистит их", () => {
    const r = checkRegistration({ name: "  Иванова   Анна ", login: " Anna.Ivanova ", password: "secret123" });
    expect(r).toEqual({ ok: true, data: ok });
  });

  it.each([
    [{ ...ok, name: "Анна" }, "name"],
    [{ ...ok, name: "" }, "name"],
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
    expect(r.ok && Object.keys(r.data)).toEqual(["name", "login", "password"]);
  });
});
