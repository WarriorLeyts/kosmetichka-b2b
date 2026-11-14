import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ role: "staff" as "staff" | "customer" | "none" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => session.role === "none" ? undefined : key === (session.role === "staff" ? "admin_token" : "auth_token") ? { value: "t" } : undefined }) }));
vi.mock("@/lib/auth", () => ({ verifyToken: async () => ({ role: "admin" }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 7 }) }));
const files = vi.hoisted(() => ({ writeFile: vi.fn(async () => {}), mkdir: vi.fn(async () => {}) }));
vi.mock("fs/promises", () => files);
const db = vi.hoisted(() => ({ loginAttempt: { findUnique: vi.fn(async () => null as null | { count: number; resetAt: Date }), upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { POST } from "./route";
import { typeForExt } from "./storage";
const upload = (name: string, size = 100, mime = "audio/mp4") => {
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(size)], { type: mime }), name);
  return POST(new Request("https://x/api/uploads/chat", { method: "POST", body: form }));
};
beforeEach(() => { vi.clearAllMocks(); session.role = "staff"; db.loginAttempt.findUnique.mockResolvedValue(null); });
describe("voice uploads", () => {
  it.each([["m4a", "audio/mp4"], ["weba", "audio/webm"], ["ogg", "audio/ogg"], ["mp3", "audio/mpeg"], ["wav", "audio/wav"]])("%s is stored and served as audio", async (ext, mime) => {
    const r = await upload(`voice.${ext}`, 100, mime);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toMatchObject({ kind: "audio", mime, size: 100 });
    expect(data.url).toMatch(new RegExp(`^/api/uploads/chat/chat-[0-9]+-[a-f0-9]+\\.${ext}$`));
    expect(typeForExt(ext)?.mime).toBe(mime);
    expect(files.writeFile).toHaveBeenCalledTimes(1);
  });
  it("requires authentication", async () => { session.role = "none"; expect((await upload("voice.m4a")).status).toBe(401); expect(files.writeFile).not.toHaveBeenCalled(); });
  it("rejects empty recordings", async () => { expect((await upload("voice.m4a", 0)).status).toBe(400); expect(files.writeFile).not.toHaveBeenCalled(); });
  it("enforces a 10 MB limit", async () => { expect((await upload("voice.m4a", 10 * 1024 * 1024 + 1)).status).toBe(400); expect(files.writeFile).not.toHaveBeenCalled(); });
  it("applies the customer daily quota to voice files too", async () => {
    session.role = "customer";
    db.loginAttempt.findUnique.mockResolvedValue({ count: 300 * 1024 * 1024, resetAt: new Date(Date.now() + 60000) });
    expect((await upload("voice.m4a")).status).toBe(429);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("does not enable executable attachments", async () => { expect((await upload("voice.svg")).status).toBe(400); expect(typeForExt("html")).toBe(null); });
});
