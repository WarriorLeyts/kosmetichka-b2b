import path from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { DATA_ROOT } from "./dataDir";
import { mediaName } from "./stories";

export const STORIES_DIR = path.join(DATA_ROOT, "stories");
export class StoryMediaError extends Error {}
export function storyMediaType(name: string) {
  if (!mediaName.test(name)) return null;
  return ({ webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[name.split(".").pop()!] ?? null;
}
export async function storyFilesExist(urls: string[]) {
  for (const url of urls) {
    const name = url.split("/").pop()!;
    if (!mediaName.test(name)) return false;
    try { if (!(await stat(path.join(STORIES_DIR, name))).isFile()) return false; } catch { return false; }
  }
  return true;
}
export async function saveStoryMedia(data: Buffer) {
  if (!data.length) throw new StoryMediaError("Файл пустой");
  if (data.length > 50 * 1024 * 1024) throw new StoryMediaError("Видео — до 50 МБ, фото — до 15 МБ");
  const base = `story-${randomBytes(16).toString("hex")}`;
  const brand = data.subarray(8, 12).toString();
  const videoExt = data.subarray(4, 8).toString() === "ftyp" && !["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand) ? (brand === "qt  " ? "mov" : "mp4")
    : data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? "webm" : null;
  await mkdir(STORIES_DIR, { recursive: true });
  if (videoExt) {
    if (data.length < 32) throw new StoryMediaError("Видео повреждено");
    const filename = `${base}.${videoExt}`;
    await writeFile(path.join(STORIES_DIR, filename), data);
    return { kind: "video" as const, mediaUrl: `/api/stories/media/${filename}`, coverUrl: "", size: data.length };
  }
  if (data.length > 15 * 1024 * 1024) throw new StoryMediaError("Фото — до 15 МБ");
  try {
    const img = sharp(data, { limitInputPixels: 60_000_000 }).rotate();
    const [full, thumb] = await Promise.all([
      img.clone().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      img.clone().resize(360, 360, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
    ]);
    await Promise.all([writeFile(path.join(STORIES_DIR, `${base}.webp`), full), writeFile(path.join(STORIES_DIR, `${base}-thumb.webp`), thumb)]);
    return { kind: "img" as const, mediaUrl: `/api/stories/media/${base}.webp`, coverUrl: `/api/stories/media/${base}-thumb.webp`, size: full.length };
  } catch { throw new StoryMediaError("Не удалось прочитать изображение. Выберите JPG, PNG, WebP или видео MP4/MOV/WebM."); }
}
