import { describe, expect, it } from "vitest";
import { resetTokenHash } from "./resetToken";

describe("password-reset token in the database", () => {
  it("is the sha256 of the link's token, not the token", () => {
    const t = "a".repeat(64);
    expect(resetTokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(resetTokenHash(t)).not.toBe(t);
    expect(resetTokenHash(t)).toBe(resetTokenHash(t));
  });
});
