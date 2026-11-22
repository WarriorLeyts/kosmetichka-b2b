import sharp from "sharp";

// Bound decoding memory for full-size phone photos and simultaneous staff thumbnails.
const slots: Promise<void>[] = [Promise.resolve(), Promise.resolve()];
let next = 0;
export async function processProofImage(input: Buffer, width = 1600, thumbnail = false): Promise<Buffer> {
  const slot = next++ % slots.length;
  const previous = slots[slot];
  let release!: () => void;
  slots[slot] = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const image = sharp(input, { limitInputPixels: 64_000_000, failOn: "error" }).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" });
    return await (thumbnail ? image.webp({ quality: 76 }) : image.jpeg({ quality: 80, mozjpeg: true })).toBuffer();
  } finally { release(); }
}
