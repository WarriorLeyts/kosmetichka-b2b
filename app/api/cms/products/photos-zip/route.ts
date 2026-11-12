import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { addProductPhotos, articleKey, parsePhotoName } from "@/lib/cms/productPhotos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ZIP = 300 * 1024 * 1024; // архив
const MAX_TOTAL = 800 * 1024 * 1024; // распакованное
const MAX_FILES = 3000;
const TMP = path.join(os.tmpdir(), "cms-photo-zips");

type Plan = { productId: number; name: string; article: string | null; files: string[]; current: number }[];

/** ZIP → entries (only pictures; macOS service files and folders skipped). Refuses zip bombs. */
function readZip(buf: Buffer): Map<string, Uint8Array> {
  let total = 0;
  let count = 0;
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => {
      if (!/\.(jpe?g|png|webp)$/i.test(f.name) || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false;
      count++;
      total += f.originalSize;
      if (count > MAX_FILES) throw new Error(`В архиве больше ${MAX_FILES} фото — разбейте на части`);
      if (total > MAX_TOTAL) throw new Error("Архив слишком большой в распакованном виде (больше 800 МБ)");
      return true;
    },
  });
  return new Map(Object.entries(files));
}

async function buildPlan(entries: Map<string, Uint8Array>) {
  const products = await prisma.product.findMany({ where: { article: { not: null } }, select: { id: true, name: true, article: true, _count: { select: { images: true } } } });
  const byKey = new Map<string, typeof products>();
  for (const p of products) {
    const k = articleKey(p.article);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const groups = new Map<number, { p: (typeof products)[number]; files: { name: string; index: number }[] }>();
  const unmatched: string[] = [];
  const ambiguous: { file: string; articles: string[] }[] = [];
  for (const name of entries.keys()) {
    const parsed = parsePhotoName(name);
    const key = parsed && articleKey(parsed.base);
    const found = key ? byKey.get(key) : undefined;
    if (!found?.length) {
      unmatched.push(name);
      continue;
    }
    if (found.length > 1) {
      ambiguous.push({ file: name, articles: found.map((f) => f.article ?? "") });
      continue;
    }
    const p = found[0];
    const g = groups.get(p.id) ?? { p, files: [] };
    g.files.push({ name, index: parsed!.index });
    groups.set(p.id, g);
  }
  const plan: Plan = [...groups.values()].map(({ p, files }) => ({
    productId: p.id,
    name: p.name,
    article: p.article,
    current: p._count.images,
    files: files.sort((a, b) => a.index - b.index || a.name.localeCompare(b.name)).map((f) => f.name),
  }));
  return { plan, unmatched, ambiguous };
}

// POST /api/cms/products/photos-zip
//  1) form: file=<zip>            → разбор: какие фото к каким товарам (ничего не меняет), token
//  2) json: {token, mode}         → применить: mode «add» — добавить к фото товара, «replace» — заменить
export async function POST(request: Request) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  fs.mkdirSync(TMP, { recursive: true });

  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    const f = form.get("file");
    if (!f || typeof f === "string") return NextResponse.json({ error: "Выберите ZIP-архив" }, { status: 400 });
    if (f.size > MAX_ZIP) return NextResponse.json({ error: "Архив больше 300 МБ — разбейте на части" }, { status: 400 });
    const buf = Buffer.from(await f.arrayBuffer());
    let entries: Map<string, Uint8Array>;
    try {
      entries = readZip(buf);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error && e.message.startsWith("В архиве") ? e.message : "Не удалось открыть архив — это точно ZIP?" }, { status: 400 });
    }
    if (!entries.size) return NextResponse.json({ error: "В архиве нет фото (JPG, PNG, WebP)" }, { status: 400 });
    const { plan, unmatched, ambiguous } = await buildPlan(entries);
    const token = crypto.randomBytes(12).toString("hex");
    fs.writeFileSync(path.join(TMP, `${token}.zip`), buf);
    fs.writeFileSync(path.join(TMP, `${token}.json`), JSON.stringify({ userId: g.user.id, plan, at: Date.now() }));
    // старые разборы (больше суток) — удаляем
    for (const n of fs.readdirSync(TMP)) {
      try {
        if (Date.now() - fs.statSync(path.join(TMP, n)).mtimeMs > 86400_000) fs.unlinkSync(path.join(TMP, n));
      } catch {
        /* уже удалён */
      }
    }
    return NextResponse.json({ token, files: entries.size, plan, unmatched, ambiguous });
  }

  const body = (await request.json().catch(() => null)) as { token?: string; mode?: string } | null;
  const token = body?.token && /^[a-f0-9]{24}$/.test(body.token) ? body.token : null;
  const mode = body?.mode === "replace" ? "replace" : "add";
  if (!token || !fs.existsSync(path.join(TMP, `${token}.json`))) return NextResponse.json({ error: "Разбор устарел — загрузите архив ещё раз" }, { status: 400 });
  const saved = JSON.parse(fs.readFileSync(path.join(TMP, `${token}.json`), "utf8")) as { userId: number; plan: Plan };
  if (saved.userId !== g.user.id) return NextResponse.json({ error: "Этот разбор сделан другим сотрудником" }, { status: 403 });
  const entries = readZip(fs.readFileSync(path.join(TMP, `${token}.zip`)));

  let products = 0;
  let photos = 0;
  const errors: string[] = [];
  for (const item of saved.plan) {
    try {
      const bufs = item.files.map((n) => entries.get(n)).filter((x): x is Uint8Array => !!x).map((u) => Buffer.from(u));
      photos += await addProductPhotos(item.productId, bufs, mode);
      products++;
    } catch (e) {
      errors.push(`${item.article ?? item.productId}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }
  fs.rmSync(path.join(TMP, `${token}.zip`), { force: true });
  fs.rmSync(path.join(TMP, `${token}.json`), { force: true });
  await logAction(g.user, g.ip, {
    action: "product.photos.zip",
    entity: "product",
    summary: `Фото из ZIP (${mode === "replace" ? "замена" : "добавление"}): товаров ${products}, фото ${photos}${errors.length ? `, ошибок ${errors.length}` : ""}`,
    after: { products: saved.plan.map((p) => p.productId), errors },
  });
  return NextResponse.json({ ok: true, products, photos, errors });
}
