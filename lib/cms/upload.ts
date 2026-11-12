import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { DATA_ROOT } from "@/lib/dataDir";

sharp.cache(false);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp", "gif", "heif", "avif", "tiff"]);

export class UploadError extends Error {}

/**
 * Saves an uploaded picture safely: the bytes must really be an image (read by sharp, not by the
 * file name), it is re-encoded (drops anything hidden in the file, EXIF included) and stored as
 * WebP under data/1c/uploads/<folder>/ with a random name. Returns the path the site stores
 * ("uploads/<folder>/<name>.webp", served at /1c/…).
 */
export async function saveImage(data: Buffer, folder: "banners" | "products" | "pages", maxWidth = 2400): Promise<string> {
  if (!data.length) throw new UploadError("Пустой файл");
  if (data.length > MAX_UPLOAD_BYTES) throw new UploadError("Файл больше 15 МБ");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(data, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new UploadError("Это не изображение");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new UploadError("Формат не поддерживается (нужен JPG, PNG или WebP)");
  const out = await sharp(data, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
  const dir = path.join(DATA_ROOT, "1c", "uploads", folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.webp`;
  const tmp = path.join(dir, `.${name}.tmp`);
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, path.join(dir, name));
  return `uploads/${folder}/${name}`;
}

/** Reads one file of a multipart form as a Buffer (null if missing). */
export async function formFile(form: FormData, field: string): Promise<{ name: string; data: Buffer } | null> {
  const f = form.get(field);
  if (!f || typeof f === "string") return null;
  if (f.size > MAX_UPLOAD_BYTES) throw new UploadError("Файл больше 15 МБ");
  return { name: f.name, data: Buffer.from(await f.arrayBuffer()) };
}
