import { describe, expect, it } from "vitest";
import { foreignContactPhone, normalizePhone, toSmsAeroPhone } from "./phone";
import { maxmaPhone } from "./maxma";
it.each(["+995555123456", "+821012345678", "+12025550123", "+441234567890", "+33123456789"])("preserves international country code in %s", phone => {
  expect(foreignContactPhone(phone)).toBe(phone);
  expect(normalizePhone(phone)).toBe(phone);
  expect(toSmsAeroPhone(phone)).toBeNull();
  expect(maxmaPhone(phone)).toBeNull();
});
describe("Russian SMS phones", () => {
  it("preserves the current +7 / 8 behaviour", () => {
    expect(normalizePhone("+7 (915) 450-97-17")).toBe("89154509717");
    expect(toSmsAeroPhone("89154509717")).toBe("79154509717");
    expect(foreignContactPhone("+79154509717")).toBeNull();
  });
});
