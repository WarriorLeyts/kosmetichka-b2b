import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processProofImage } from "./proofImage";

describe("proof photos", () => {
  it("shrinks a large phone image and strips metadata while preserving orientation", async () => {
    const input = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#376d92" } }).jpeg({ quality: 98 }).withMetadata({ orientation: 6 }).toBuffer();
    const output = await processProofImage(input);
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([1067, 1600]);
    expect(meta.format).toBe("jpeg"); expect(meta.exif).toBeUndefined();
    expect(output.length).toBeLessThan(input.length);
  });
  it("provides a small private thumbnail and does not upscale small photographs", async () => {
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#e34c74" } }).png().toBuffer();
    const meta = await sharp(await processProofImage(input, 320, true)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([320, 240, "webp"]);
    expect((await sharp(await processProofImage(input)).metadata()).width).toBe(800);
  });
  it("rejects malformed image content", async () => {
    await expect(processProofImage(Buffer.from("not a photo"))).rejects.toThrow();
  });
});
