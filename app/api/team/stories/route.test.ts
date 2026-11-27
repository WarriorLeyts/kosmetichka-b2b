import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), files: vi.fn(), upload: vi.fn() }));
vi.mock("@/app/api/team/_auth", () => ({ ADMIN_ONLY: ["admin"], requireStaff: m.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { cmsSetting: { findMany: m.findMany, create: m.create, updateMany: m.updateMany, deleteMany: m.deleteMany, findUnique: m.findUnique } } }));
vi.mock("@/lib/storyMedia", () => ({ storyFilesExist: m.files, saveStoryMedia: m.upload, StoryMediaError: class extends Error {} }));
import { GET, POST } from "./route";
import { PUT, DELETE } from "./[id]/route";
import { POST as upload } from "./upload/route";
import { GET as publicGET } from "@/app/api/stories/route";
const id = "a".repeat(32), updatedAt = "2026-11-27T08:00:00.000Z";
const body = { title: "Обзор", kind: "img", mediaUrl: `/api/stories/media/story-${id}.webp`, coverUrl: `/api/stories/media/story-${id}-thumb.webp`, link: "https://t.me/shop", linkLabel: "В Telegram", published: true, expiresAt: null, position: 0, updatedAt };
const req = (b: unknown) => new Request("https://test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const ctx = { params: Promise.resolve({ id }) };
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ ok: true, session: { id: 1, role: "admin" } }); m.files.mockResolvedValue(true); });
describe("stories permissions and writes", () => {
  it.each([401, 403])("blocks non-admins before database or files (%s)", async status => {
    m.auth.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
    for (const action of [() => GET(), () => POST(req(body)), () => PUT(req(body), ctx), () => DELETE(req(body), ctx), () => upload(req(body))]) expect((await action()).status).toBe(status);
    expect(m.findMany).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled(); expect(m.auth).toHaveBeenCalledWith(["admin"]);
  });
  it("creates a story only with media already saved on the server", async () => {
    m.files.mockResolvedValueOnce(false); expect((await POST(req(body))).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
    m.create.mockImplementation(async ({ data }) => ({ ...data, updatedAt: new Date(updatedAt) }));
    const r = await POST(req(body)); expect(r.status).toBe(201); const data = await r.json(); expect(data.item.title).toBe("Обзор"); expect(m.create.mock.calls[0][0].data.updatedBy).toBe("1");
  });
  it("rejects unsafe links before saving", async () => { expect((await POST(req({ ...body, link: "javascript:alert(1)" }))).status).toBe(400); expect(m.create).not.toHaveBeenCalled(); });
  it("reuses a creation request after a lost response", async () => {
    m.findUnique.mockResolvedValue({ key: "story:" + id, value: body, updatedAt: new Date(updatedAt) });
    expect((await POST(req({ ...body, requestId: id }))).status).toBe(200); expect(m.create).not.toHaveBeenCalled();
  });
  it("cannot overwrite or delete a newer edit", async () => {
    m.updateMany.mockResolvedValue({ count: 0 }); m.deleteMany.mockResolvedValue({ count: 0 });
    expect((await PUT(req(body), ctx)).status).toBe(409); expect((await DELETE(req({ updatedAt }), ctx)).status).toBe(409);
    expect(m.updateMany.mock.calls[0][0].where).toEqual({ key: "story:" + id, updatedAt: new Date(updatedAt) });
  });
  it("public feed includes only active publications while admin sees drafts", async () => {
    m.findMany.mockResolvedValue([{ key: "story:" + id, value: body, updatedAt: new Date(updatedAt) }, { key: "story:" + "b".repeat(32), value: { ...body, published: false }, updatedAt: new Date(updatedAt) }]);
    expect((await (await publicGET()).json()).items).toHaveLength(1); expect((await (await GET()).json()).items).toHaveLength(2);
  });
});
