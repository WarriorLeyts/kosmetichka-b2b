import { NextResponse } from "next/server";
import { currentCustomerId } from "../../mobile/_auth";
import { demandSameOrigin } from "@/lib/customerDemand";
import { RateLimiter } from "@/lib/rateLimit";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { DEMAND_PHOTO_DIR, demandPhotoPath } from "./storage";
const limiter = new RateLimiter({ windowMs: 86400000, max: 40 });
export async function POST(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!limiter.check(String(id)).ok) return NextResponse.json({ error: "Лимит загрузки фото на сегодня исчерпан" }, { status: 429 });
  if (Number(request.headers.get("content-length")) > 16 * 1024 * 1024) return NextResponse.json({ error: "Фото должно быть до 15 МБ" }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Выберите фото до 15 МБ" }, { status: 400 });
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false }).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const name = `${id}_${randomUUID()}.webp`;
    await mkdir(DEMAND_PHOTO_DIR, { recursive: true });
    await writeFile(demandPhotoPath(name), bytes, { flag: "wx", mode: 0o600 });
    return NextResponse.json({ photoName: name, url: `/api/demand/photo/${name}` });
  } catch { return NextResponse.json({ error: "Не удалось прочитать фото. Выберите JPG, PNG или WebP." }, { status: 400 }); }
}
