import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { addProductPhotos } from "@/lib/cms/productPhotos";
import { MAX_UPLOAD_BYTES, UploadError, saveImageWithOriginal } from "@/lib/cms/upload";

type Ctx = { params: Promise<{ id: string }> };
async function product(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? prisma.product.findUnique({ where: { id }, select: { id: true, name: true } }) : null;
}

// POST /api/cms/products/:id/photos (form: files[]) — добавить фото в конец галереи
export async function POST(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const p = await product(ctx);
  if (!p) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string").slice(0, 20);
  if (!files.length) return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
  const replaceId = Number(form.get("replaceId") ?? 0);
  try {
    // замена одного фото: на том же месте галереи, с тем же alt и вариантами
    if (replaceId) {
      const img = await prisma.productImage.findFirst({ where: { id: replaceId, productId: p.id } });
      if (!img) return NextResponse.json({ error: "Фото не найдено" }, { status: 404 });
      if (files[0].size > MAX_UPLOAD_BYTES) throw new UploadError("Файл больше 15 МБ");
      const saved = await saveImageWithOriginal(Buffer.from(await files[0].arrayBuffer()), "products", 2000);
      await prisma.productImage.update({ where: { id: img.id }, data: { path: saved.path, original: saved.original, hash: null } });
      revalidatePath(`/product/${p.id}`);
      await logAction(g.user, g.ip, { action: "product.photos.replace", entity: "product", entityId: p.id, summary: `Товар «${p.name}»: заменено фото`, before: { path: img.path }, after: { path: saved.path } });
      return NextResponse.json({ ok: true, replaced: img.id });
    }
    if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) throw new UploadError("Файл больше 15 МБ");
    const n = await addProductPhotos(p.id, await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))));
    await logAction(g.user, g.ip, { action: "product.photos.add", entity: "product", entityId: p.id, summary: `Товар «${p.name}»: добавлено фото: ${n}` });
    return NextResponse.json({ ok: true, added: n });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

// PUT /api/cms/products/:id/photos {order:[imageId…]} — порядок фото (первое — главное)
export async function PUT(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const p = await product(ctx);
  if (!p) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const body = await parseBody(request, z.object({ order: z.array(z.number().int().positive()).max(100) }));
  if (body instanceof NextResponse) return body;
  const own = new Set((await prisma.productImage.findMany({ where: { productId: p.id }, select: { id: true } })).map((i) => i.id));
  const ids = body.order.filter((id) => own.has(id));
  await prisma.$transaction(ids.map((id, i) => prisma.productImage.update({ where: { id }, data: { sortOrder: i } })));
  revalidatePath(`/product/${p.id}`);
  await logAction(g.user, g.ip, { action: "product.photos.order", entity: "product", entityId: p.id, summary: `Товар «${p.name}»: изменён порядок фото`, after: { order: ids } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/cms/products/:id/photos?imageId= — убрать фото из галереи (файл остаётся на диске)
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const p = await product(ctx);
  if (!p) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const imageId = Number(new URL(request.url).searchParams.get("imageId"));
  const img = await prisma.productImage.findFirst({ where: { id: imageId, productId: p.id }, include: { _count: { select: { variants: true } } } });
  if (!img) return NextResponse.json({ error: "Фото не найдено" }, { status: 404 });
  if (img._count.variants > 0) return NextResponse.json({ error: "Это фото привязано к варианту товара (оттенку) — сначала поменяйте фото варианта в Team" }, { status: 409 });
  await prisma.productImage.delete({ where: { id: img.id } });
  revalidatePath(`/product/${p.id}`);
  await logAction(g.user, g.ip, { action: "product.photos.delete", entity: "product", entityId: p.id, summary: `Товар «${p.name}»: удалено фото`, before: { path: img.path } });
  return NextResponse.json({ ok: true });
}
