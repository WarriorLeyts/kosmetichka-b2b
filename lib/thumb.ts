import fs from "fs";
import path from "path";
import sharp from "sharp";

/**
 * Уменьшенные копии фото товаров из 1С: /1c/<путь>?w=320 → WebP шириной ≤320px.
 * Копия делается один раз и кладётся в data/1c/.thumbs/w<ширина>/<путь>.webp
 * (папка data переживает деплой — deploy.sh её сохраняет), дальше отдаётся с диска.
 * Оригиналы не меняются: без ?w отдаётся исходный файл, как раньше.
 */
export const THUMB_WIDTHS = [160, 320, 480, 800, 1200] as const;

sharp.cache(false); // на сервере мало памяти — без кэша sharp
sharp.concurrency(1);

const inflight = new Map<string, Promise<Buffer | null>>();

export function pickWidth(raw: string | null): number | null {
  const w = Number(raw);
  if (!raw || !Number.isFinite(w) || w <= 0) return null;
  // ближайшая разрешённая ширина не меньше запрошенной (защита от генерации тысяч размеров)
  return THUMB_WIDTHS.find((x) => x >= w) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

async function build(src: string, dest: string, width: number): Promise<Buffer | null> {
  try {
    const buf = await sharp(src, { failOn: "none" })
      .rotate()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    return buf;
  } catch (e) {
    console.error("[thumb] failed", src, (e as Error).message);
    return null;
  }
}

/** Возвращает Response с уменьшенной копией или null (тогда отдаётся оригинал). */
/**
 * Фото заменили (1С прислала новый файл с тем же именем, или его пережали):
 * старые уменьшенные копии удаляем. Их отдаёт nginx напрямую, не сравнивая даты,
 * поэтому без этого показывалось бы старое фото.
 */
export function dropThumbs(baseDir: string, filePath: string) {
  const rel = path.relative(baseDir, filePath);
  if (!rel || rel.startsWith("..")) return;
  for (const w of THUMB_WIDTHS) {
    try {
      fs.unlinkSync(path.join(baseDir, ".thumbs", `w${w}`, rel + ".webp"));
    } catch {
      /* копии не было */
    }
  }
}

export async function thumbResponse(baseDir: string, resolvedPath: string, width: number): Promise<Response | null> {
  const ext = path.extname(resolvedPath).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return null;
  const rel = path.relative(baseDir, resolvedPath);
  const dest = path.join(baseDir, ".thumbs", `w${width}`, rel + ".webp");

  let buf: Buffer | null = null;
  try {
    const [s, d] = [fs.statSync(resolvedPath), fs.statSync(dest)];
    if (d.mtimeMs >= s.mtimeMs) buf = fs.readFileSync(dest);
  } catch {
    /* копии ещё нет */
  }
  if (!buf) {
    let p = inflight.get(dest);
    if (!p) {
      p = build(resolvedPath, dest, width).finally(() => inflight.delete(dest));
      inflight.set(dest, p);
    }
    buf = await p;
  }
  if (!buf) return null;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
