import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
const state = vi.hoisted(() => ({ root: "" }));
vi.mock("@/lib/dataDir", () => ({ get DATA_ROOT() { return state.root; } }));
beforeAll(async () => { state.root = await fs.mkdtemp(path.join(os.tmpdir(), "product-upload-")); });
afterAll(async () => { await fs.rm(state.root, { recursive: true, force: true }); });
it("preserves the source and prepares correctly sized WebP display copies before returning", async () => {
  const { saveImageWithOriginal } = await import("./upload");
  const input = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: "#c7a67c" } }).jpeg().toBuffer();
  const saved = await saveImageWithOriginal(input, "products", 2000);
  expect(await fs.readFile(path.join(state.root, "1c", saved.original!))).toEqual(input);
  for (const width of [160, 480, 800]) {
    const buf = await fs.readFile(path.join(state.root, "1c", ".thumbs", `w${width}`, saved.path + ".webp"));
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.height).toBe(width);
    expect(meta.width).toBe(Math.round(width * 0.8));
    expect(buf.length).toBeLessThan(input.length);
  }
});
