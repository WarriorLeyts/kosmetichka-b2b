import { describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {} }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { needsRenewal, RENEW_AFTER_SEC } from "./sessionRenew";

describe("sliding sessions", () => {
  const now = 2_000_000_000;
  it("a token younger than a day stays", () => expect(needsRenewal(now - 3600, now)).toBe(false));
  it("an older one is re-issued", () => expect(needsRenewal(now - RENEW_AFTER_SEC - 1, now)).toBe(true));
  it("no iat — left alone", () => expect(needsRenewal(undefined, now)).toBe(false));
});
