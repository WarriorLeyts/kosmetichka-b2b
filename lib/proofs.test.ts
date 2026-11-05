import { describe, expect, it, vi } from "vitest";
vi.stubEnv("JWT_SECRET", "test-secret-for-proof-tests-0123456789");
const { createProofToken, verifyProofToken, proofViewUrl, verifyProofView, proofType, shopFields } = await import("./proofs");
const { createToken, verifyToken } = await import("./auth");

describe("wholesale proof", () => {
  it("photos and videos only", () => {
    expect(proofType("shop.JPG")?.kind).toBe("img");
    expect(proofType("orders.mov")?.kind).toBe("video");
    expect(proofType("doc.pdf")).toBeNull();
    expect(proofType("x.html")).toBeNull();
    expect(proofType("noext")).toBeNull();
  });

  it("where the customer resells: a type; a link is optional", () => {
    expect(shopFields({ shopType: "offline" })).toEqual({ shopType: "offline", shopLink: null });
    expect(shopFields({ shopType: "online", shopLink: " instagram.com/shop " })).toEqual({ shopType: "online", shopLink: "instagram.com/shop" });
    expect(shopFields({ shopType: "online" })).toEqual({ shopType: "online", shopLink: null });
    expect(shopFields({ shopType: "both", shopLink: "" })).toEqual({ shopType: "both", shopLink: null });
    expect(shopFields({})).toMatchObject({ field: "shopType" });
    expect(shopFields({ shopType: "warehouse" })).toMatchObject({ field: "shopType" });
  });

  it("the upload pass belongs to one customer and is no login", async () => {
    const t = await createProofToken(42);
    expect(await verifyProofToken(t)).toBe(42);
    expect(await verifyToken(t)).toBeNull();
    const login = await createToken({ id: 42, email: "a@b.ru", role: "customer" });
    expect(await verifyProofToken(login)).toBeNull();
  });

  it("a staff view link opens only its own file", async () => {
    const url = await proofViewUrl(7);
    const t = decodeURIComponent(url.split("t=")[1]);
    expect(url.startsWith("/api/proofs/7?t=")).toBe(true);
    expect(await verifyProofView(t, 7)).toBe(true);
    expect(await verifyProofView(t, 8)).toBe(false);
    expect(await verifyProofView(await createProofToken(7), 7)).toBe(false);
  });
});
