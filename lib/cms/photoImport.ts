import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { DATA_ROOT } from "@/lib/dataDir";
import { listZipImages, readZipEntries, IMAGE_RE } from "./zipReader";
import { articleKey, parsePhotoName } from "./photoNames";
import { addProductPhotos } from "./productPhotos";
import { registerJobHandler, type JobContext } from "./jobs";

/**
 * Photo import of the admin panel («Товары → Фото»): files (single / many), ZIP archives and an Excel
 * sheet «артикул → файл». Files are streamed to the disk (an upload session), then analysed (which
 * photo goes to which product — nothing changes yet), then a background job (lib/cms/jobs.ts) adds them.
 */
export const SESSIONS = path.join(DATA_ROOT, "cms-jobs", "sessions");
export const MAX_FILE = 2 * 1024 * 1024 * 1024; // 2 ГБ на файл
export const MAX_SESSION = 4 * 1024 * 1024 * 1024; // 4 ГБ на загрузку

export type Mode = "skip" | "add" | "replace";
export type PlanFile = { key: string; label: string; index: number; how: "exact" | "normalized" | "excel" };
export type PlanItem = { productId: number; article: string | null; name: string; current: number; files: PlanFile[] };
export type Analysis = {
  images: number;
  plan: PlanItem[];
  unmatched: string[];
  ambiguous: { file: string; articles: string[] }[];
  excel: { rows: number; missingFiles: string[]; unknownArticles: string[] } | null;
  bad: string[];
};

type SessionMeta = { userId: number; createdAt: number; files: { stored: string; name: string; size: number }[] };

const sessionDir = (sid: string) => {
  if (!/^[a-f0-9]{24}$/.test(sid)) throw new Error("bad session");
  return path.join(SESSIONS, sid);
};
const readMeta = (sid: string): SessionMeta => JSON.parse(fs.readFileSync(path.join(sessionDir(sid), "meta.json"), "utf8"));
const writeMeta = (sid: string, m: SessionMeta) => fs.writeFileSync(path.join(sessionDir(sid), "meta.json"), JSON.stringify(m));

export function newSession(userId: number): string {
  cleanupOld();
  const sid = crypto.randomBytes(12).toString("hex");
  fs.mkdirSync(path.join(sessionDir(sid), "files"), { recursive: true });
  writeMeta(sid, { userId, createdAt: Date.now(), files: [] });
  return sid;
}

export function sessionOwner(sid: string): number | null {
  try {
    return readMeta(sid).userId;
  } catch {
    return null;
  }
}

/** sessions older than 3 days (their jobs are long finished) */
function cleanupOld() {
  try {
    for (const d of fs.readdirSync(SESSIONS)) {
      const p = path.join(SESSIONS, d);
      if (Date.now() - fs.statSync(p).mtimeMs > 3 * 86400_000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {
    /* папки ещё нет */
  }
}

/** writes one uploaded file (request body stream) to the session folder; returns its stored name */
export async function saveUpload(sid: string, originalName: string, body: ReadableStream<Uint8Array>): Promise<{ name: string; size: number }> {
  const meta = readMeta(sid);
  const name = path.basename(originalName).replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 200) || "file";
  if (!/\.(zip|xlsx|jpe?g|png|webp)$/i.test(name)) throw new UploadRejected(`«${name}»: нужен JPG, PNG, WebP, ZIP или XLSX`);
  const stored = `${meta.files.length}-${crypto.randomBytes(4).toString("hex")}${path.extname(name).toLowerCase()}`;
  const dest = path.join(sessionDir(sid), "files", stored);
  const used = meta.files.reduce((s, f) => s + f.size, 0);
  let size = 0;
  const limit = Math.min(MAX_FILE, MAX_SESSION - used);
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > limit) return cb(new UploadRejected(size > MAX_FILE ? "Файл больше 2 ГБ" : "Загрузка больше 4 ГБ — разбейте на части"));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import("stream/web").ReadableStream), counter, fs.createWriteStream(dest));
  } catch (e) {
    fs.rmSync(dest, { force: true });
    throw e;
  }
  // проверка содержимого по первым байтам (а не по имени)
  const head = Buffer.alloc(12);
  const fd = fs.openSync(dest, "r");
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isImg = (head[0] === 0xff && head[1] === 0xd8) || head.subarray(0, 4).toString("hex") === "89504e47" || (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP");
  const ext = path.extname(name).toLowerCase();
  if (((ext === ".zip" || ext === ".xlsx") && !isZip) || (IMAGE_RE.test(name) && !isImg)) {
    fs.rmSync(dest, { force: true });
    throw new UploadRejected(`«${name}»: содержимое не совпадает с типом файла`);
  }
  meta.files.push({ stored, name, size });
  writeMeta(sid, meta);
  return { name, size };
}

export class UploadRejected extends Error {}

/** Excel «Артикул | Файл [| Название]»: file name (lower case, no folders) → article and photo number */
async function readExcelMapping(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) return { map: new Map<string, { article: string; index: number }>(), rows: 0 };
  let artCol = 0;
  let fileCol = 0;
  let headerRow = 0;
  ws.eachRow((row, r) => {
    if (headerRow) return;
    row.eachCell((c, col) => {
      const t = String(c.text ?? "").toLowerCase();
      if (!artCol && /артикул|код/.test(t)) artCol = col;
      if (!fileCol && /файл|фото|изображ|картин|file/.test(t)) fileCol = col;
    });
    if (artCol && fileCol) headerRow = r;
  });
  if (!headerRow) {
    // без заголовков: A — артикул, B — файл
    artCol = 1;
    fileCol = 2;
  }
  const map = new Map<string, { article: string; index: number }>();
  let rows = 0;
  ws.eachRow((row, r) => {
    if (r <= headerRow) return;
    const article = String(row.getCell(artCol).text ?? "").trim();
    const files = String(row.getCell(fileCol).text ?? "")
      .split(/[,;\n]+/)
      .map((f) => f.trim())
      .filter(Boolean);
    if (!article || !files.length) return;
    rows++;
    files.forEach((f, i) => map.set(path.basename(f).toLowerCase(), { article, index: i + 1 }));
  });
  return { map, rows };
}

/** which photo goes to which product: exact article first, then the article without hyphen / zeros */
export async function analyze(sid: string): Promise<Analysis> {
  const meta = readMeta(sid);
  const dir = path.join(sessionDir(sid), "files");
  type Src = { key: string; label: string; base: string };
  const sources: Src[] = [];
  const bad: string[] = [];
  let excel: { map: Map<string, { article: string; index: number }>; rows: number } | null = null;
  for (const f of meta.files) {
    const full = path.join(dir, f.stored);
    if (/\.zip$/i.test(f.name)) {
      try {
        for (const e of await listZipImages(full)) sources.push({ key: `zip:${f.stored}:${e.name}`, label: `${f.name} → ${e.name}`, base: path.basename(e.name) });
      } catch (err) {
        bad.push(`${f.name}: ${err instanceof Error ? err.message : "не удалось открыть архив"}`);
      }
    } else if (/\.xlsx$/i.test(f.name)) {
      try {
        excel = await readExcelMapping(full);
      } catch {
        bad.push(`${f.name}: не удалось прочитать Excel`);
      }
    } else {
      sources.push({ key: `file:${f.stored}`, label: f.name, base: f.name });
    }
  }

  const products = await prisma.product.findMany({ where: { article: { not: null } }, select: { id: true, name: true, article: true, _count: { select: { images: true } } } });
  const exact = new Map<string, (typeof products)[number][]>();
  const norm = new Map<string, (typeof products)[number][]>();
  for (const p of products) {
    const e = p.article!.trim().toUpperCase();
    exact.set(e, [...(exact.get(e) ?? []), p]);
    const k = articleKey(p.article);
    if (k) norm.set(k, [...(norm.get(k) ?? []), p]);
  }

  const groups = new Map<number, PlanItem>();
  const unmatched: string[] = [];
  const ambiguous: { file: string; articles: string[] }[] = [];
  const excelSeen = new Set<string>();
  for (const s of sources) {
    const viaExcel = excel?.map.get(s.base.toLowerCase());
    let article: string;
    let index: number;
    if (viaExcel) {
      excelSeen.add(s.base.toLowerCase());
      article = viaExcel.article;
      index = viaExcel.index;
    } else {
      const parsed = parsePhotoName(s.base);
      if (!parsed) continue;
      article = parsed.base;
      index = parsed.index;
    }
    let how: PlanFile["how"] = viaExcel ? "excel" : "exact";
    let found = exact.get(article.trim().toUpperCase());
    if (!found?.length) {
      const k = articleKey(article);
      found = k ? norm.get(k) : undefined;
      if (!viaExcel) how = "normalized";
    }
    if (!found?.length) {
      unmatched.push(s.label);
      continue;
    }
    if (found.length > 1) {
      ambiguous.push({ file: s.label, articles: found.map((f) => f.article ?? "") });
      continue;
    }
    const p = found[0];
    const item = groups.get(p.id) ?? { productId: p.id, article: p.article, name: p.name, current: p._count.images, files: [] };
    item.files.push({ key: s.key, label: s.label, index, how });
    groups.set(p.id, item);
  }
  const plan = [...groups.values()].map((g) => ({ ...g, files: g.files.sort((a, b) => a.index - b.index || a.label.localeCompare(b.label)).slice(0, 30) }));
  plan.sort((a, b) => (a.article ?? "").localeCompare(b.article ?? ""));

  let excelReport: Analysis["excel"] = null;
  if (excel) {
    const articlesInExcel = new Set([...excel.map.values()].map((v) => v.article));
    excelReport = {
      rows: excel.rows,
      missingFiles: [...excel.map.keys()].filter((f) => !excelSeen.has(f)).slice(0, 500),
      unknownArticles: [...articlesInExcel].filter((a) => !exact.get(a.trim().toUpperCase())?.length && !norm.get(articleKey(a) ?? "")?.length).slice(0, 500),
    };
  }

  const analysis: Analysis = { images: sources.length, plan, unmatched: unmatched.slice(0, 2000), ambiguous: ambiguous.slice(0, 500), excel: excelReport, bad };
  fs.writeFileSync(path.join(sessionDir(sid), "analysis.json"), JSON.stringify(analysis));
  return analysis;
}

export function readAnalysis(sid: string): Analysis | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir(sid), "analysis.json"), "utf8"));
  } catch {
    return null;
  }
}

export type PhotoJobPayload = { sid: string; mode: Mode };
type ItemResult = { s: "ok" | "skipped" | "error" | "partial"; n: number; e?: string };
type PhotoJobResult = { items: Record<string, ItemResult> };

async function validImage(buf: Buffer): Promise<string | null> {
  if (!buf.length) return "файл больше 40 МБ";
  try {
    const m = await sharp(buf, { limitInputPixels: 60_000_000 }).metadata();
    if (!m.format || !["jpeg", "png", "webp"].includes(m.format)) return "формат не JPG/PNG/WebP";
    return null;
  } catch {
    return "повреждённое изображение";
  }
}

/** the background part: products in batches of 40, each zip read once per batch; up to 3 tries per product */
async function photoJob(ctx: JobContext) {
  const { sid, mode } = ctx.payload as PhotoJobPayload;
  const analysis = readAnalysis(sid);
  if (!analysis) throw new Error("Разбор загрузки не найден (папка удалена?)");
  const dir = path.join(sessionDir(sid), "files");
  const prev = (ctx.result as PhotoJobResult | null)?.items ?? {};
  const items: Record<string, ItemResult> = { ...prev };
  const errors: { article: string | null; file?: string; error: string }[] = [];
  const count = () => {
    const v = Object.values(items);
    return { done: v.filter((x) => x.s === "ok" || x.s === "skipped" || x.s === "partial").length, failed: v.filter((x) => x.s === "error").length };
  };
  await ctx.progress({ total: analysis.plan.length, ...count() });

  const todo = analysis.plan.filter((p) => !items[p.productId]);
  for (let i = 0; i < todo.length; i += 40) {
    if (await ctx.cancelled()) return { result: { items } };
    const batch = todo.slice(i, i + 40);
    // файлы этой партии: из архивов — одним проходом по каждому архиву
    const bufs = new Map<string, Buffer>();
    const byZip = new Map<string, Set<string>>();
    for (const it of batch)
      for (const f of it.files) {
        if (f.key.startsWith("zip:")) {
          const [, stored, ...rest] = f.key.split(":");
          const entry = rest.join(":");
          byZip.set(stored, (byZip.get(stored) ?? new Set()).add(entry));
        } else {
          const stored = f.key.slice(5);
          try {
            bufs.set(f.key, fs.readFileSync(path.join(dir, stored)));
          } catch {
            bufs.set(f.key, Buffer.alloc(0));
          }
        }
      }
    for (const [stored, names] of byZip) {
      await readZipEntries(path.join(dir, stored), names, async (name, data) => {
        bufs.set(`zip:${stored}:${name}`, data);
      });
    }

    for (const it of batch) {
      let attempt = 0;
      for (;;) {
        attempt++;
        try {
          const current = await prisma.productImage.count({ where: { productId: it.productId } });
          if (mode === "skip" && current > 0) {
            items[it.productId] = { s: "skipped", n: 0, e: "уже есть фото" };
            break;
          }
          const good: Buffer[] = [];
          const fileErrors: string[] = [];
          for (const f of it.files) {
            const b = bufs.get(f.key) ?? Buffer.alloc(0);
            const problem = await validImage(b);
            if (problem) {
              fileErrors.push(`${f.label}: ${problem}`);
              errors.push({ article: it.article, file: f.label, error: problem });
            } else good.push(b);
          }
          if (!good.length) {
            items[it.productId] = { s: "error", n: 0, e: fileErrors.join("; ") || "нет файлов" };
            break;
          }
          const n = await addProductPhotos(it.productId, good, mode === "replace" ? "replace" : "add");
          items[it.productId] = fileErrors.length ? { s: "partial", n, e: fileErrors.join("; ") } : { s: "ok", n };
          break;
        } catch (e) {
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
          const msg = e instanceof Error ? e.message : String(e);
          items[it.productId] = { s: "error", n: 0, e: msg };
          errors.push({ article: it.article, error: msg });
          break;
        }
      }
    }
    const prevErrors = ((await prisma.cmsJob.findUnique({ where: { id: ctx.id }, select: { errors: true } }))?.errors as unknown[] | null) ?? [];
    await ctx.progress({ ...count(), result: { items }, errors: [...prevErrors, ...errors.splice(0)].slice(-1000) });
  }
  return { result: { items } };
}

registerJobHandler("photos", photoJob);
