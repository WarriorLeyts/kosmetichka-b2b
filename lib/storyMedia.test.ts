import { afterAll, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "fs/promises";
import path from "path";
import sharp from "sharp";
const env = vi.hoisted(() => ({ root: `/tmp/kosmetichka-story-media-test-${process.pid}` }));
vi.mock("@/lib/dataDir", () => ({ DATA_ROOT: env.root }));
import { saveStoryMedia, storyFilesExist, storyMediaType, STORIES_DIR } from "./storyMedia";
import { GET } from "@/app/api/stories/media/[name]/route";
afterAll(async () => { await rm(env.root, { recursive: true, force: true }); });
describe("public story files", () => {
  it("re-encodes large images, strips metadata and makes a small cover", async () => {
    const png = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "#ab56cd" } }).png().withMetadata().toBuffer();
    const r = await saveStoryMedia(png);
    expect(r.kind).toBe("img"); expect(await storyFilesExist([r.mediaUrl, r.coverUrl])).toBe(true);
    const bytes = await readFile(path.join(STORIES_DIR, r.mediaUrl.split("/").pop()!)), meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp"); expect(Math.max(meta.width!, meta.height!)).toBe(1800); expect(meta.exif).toBeUndefined();
    const thumb = await sharp(path.join(STORIES_DIR, r.coverUrl.split("/").pop()!)).metadata(); expect(thumb.width).toBe(360);
  });
  it("supports full, byte and suffix reads required by iPhone video", async () => {
    const data = Buffer.alloc(100, 1); data.write("ftyp", 4); data.write("isom", 8);
    const r = await saveStoryMedia(data), name = r.mediaUrl.split("/").pop()!, ctx = { params: Promise.resolve({ name }) };
    const full = await GET(new Request("https://test"), ctx); expect(full.status).toBe(200); expect(full.headers.get("content-type")).toBe("video/mp4"); expect(Buffer.from(await full.arrayBuffer())).toEqual(data);
    const partial = await GET(new Request("https://test", { headers: { Range: "bytes=4-11" } }), ctx); expect(partial.status).toBe(206); expect(partial.headers.get("content-range")).toBe("bytes 4-11/100"); expect(Buffer.from(await partial.arrayBuffer())).toEqual(data.subarray(4, 12));
    const suffix = await GET(new Request("https://test", { headers: { Range: "bytes=-10" } }), ctx); expect(suffix.status).toBe(206); expect((await suffix.arrayBuffer()).byteLength).toBe(10);
    for (const range of ["bytes=101-", "bytes=-0", "bytes=50-20", "bytes=0-1,4-5"]) expect((await GET(new Request("https://test", { headers: { Range: range } }), ctx)).status).toBe(416);
  });
  it("rejects a renamed document and traversal without serving disk files", async () => {
    await expect(saveStoryMedia(Buffer.from("<svg><script>alert(1)</script></svg>"))).rejects.toThrow();
    expect(storyMediaType("../../.env")).toBeNull(); expect(await storyFilesExist(["/api/stories/media/../../.env"])).toBe(false);
    expect((await GET(new Request("https://test"), { params: Promise.resolve({ name: "../../.env" }) })).status).toBe(404);
  });
});
