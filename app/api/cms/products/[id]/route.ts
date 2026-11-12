import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { productPatchSchema } from "@/lib/cms/productSchema";
import { resolveImageUrl } from "@/lib/image";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET /api/cms/products/:id — карточка товара для редактора
export async function GET(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const id = await idOf(ctx);
  const p = id
    ? await prisma.product.findUnique({
        where: { id },
        include: {
          brand: { select: { name: true } },
          category: { select: { name: true, guid: true } },
          images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { _count: { select: { variants: true } } } },
          prices: { select: { priceType: true, price: true, updatedAt: true } },
          warehouseStock: { select: { qty: true, warehouse: { select: { name: true } } } },
        },
      })
    : null;
  if (!p) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const related = p.relatedIds.length
    ? await prisma.product.findMany({ where: { id: { in: p.relatedIds } }, select: { id: true, name: true, article: true, hidden: true, images: { take: 1, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { path: true } } } })
    : [];
  const relById = new Map(related.map((r) => [r.id, r]));
  return NextResponse.json({
    product: {
      id: p.id,
      guid: p.guid,
      article: p.article,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand?.name ?? null,
      category: p.category?.name ?? null,
      description: p.description,
      descriptionManual: p.descriptionManual,
      specs: Array.isArray(p.specs) ? p.specs : [],
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      hidden: p.hidden,
      stock: p.stock,
      wholesaleStock: p.wholesaleStock,
      salesCount: p.salesCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      prices: p.prices,
      warehouses: p.warehouseStock.map((w) => ({ name: w.warehouse.name, qty: w.qty })),
      images: p.images.map((i) => ({ id: i.id, path: i.path, url: resolveImageUrl(i.path, 480), full: resolveImageUrl(i.path), fromAdmin: i.path.startsWith("uploads/"), usedByVariants: i._count.variants })),
      related: p.relatedIds
        .map((rid) => relById.get(rid))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ id: r.id, name: r.name, article: r.article, hidden: r.hidden, image: resolveImageUrl(r.images[0]?.path, 160) })),
    },
    canEdit: can(g.user, "products.edit"),
  });
}

// PATCH /api/cms/products/:id — описание, характеристики, SEO, видимость, сопутствующие (цены и остатки — только из 1С)
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const id = await idOf(ctx);
  const before = id
    ? await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, description: true, descriptionManual: true, specs: true, seoTitle: true, seoDescription: true, hidden: true, relatedIds: true } })
    : null;
  if (!before) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const body = await parseBody(request, productPatchSchema);
  if (body instanceof NextResponse) return body;

  const data: Prisma.ProductUpdateInput = {};
  if (body.description !== undefined && body.description !== before.description) {
    data.description = body.description?.trim() ? body.description : null;
    data.descriptionManual = true;
  }
  if (body.descriptionFrom1C) data.descriptionManual = false;
  if (body.specs !== undefined) data.specs = body.specs.length ? (body.specs as Prisma.InputJsonValue) : ([] as Prisma.InputJsonValue);
  if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle || null;
  if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription || null;
  if (body.hidden !== undefined) data.hidden = body.hidden;
  if (body.relatedIds !== undefined) {
    const uniq = [...new Set(body.relatedIds)].filter((x) => x !== before.id);
    const exist = new Set((await prisma.product.findMany({ where: { id: { in: uniq } }, select: { id: true } })).map((p) => p.id));
    data.relatedIds = uniq.filter((x) => exist.has(x));
  }
  if (!Object.keys(data).length) return NextResponse.json({ ok: true, changed: false });

  const after = await prisma.product.update({
    where: { id: before.id },
    data,
    select: { description: true, descriptionManual: true, specs: true, seoTitle: true, seoDescription: true, hidden: true, relatedIds: true },
  });
  revalidatePath(`/product/${before.id}`);
  const fields = Object.keys(data).filter((k) => k !== "descriptionManual");
  const names: Record<string, string> = { description: "описание", specs: "характеристики", seoTitle: "SEO", seoDescription: "SEO", hidden: "видимость", relatedIds: "сопутствующие" };
  await logAction(g.user, g.ip, {
    action: "product.update",
    entity: "product",
    entityId: before.id,
    summary: `Товар «${before.name}»: ${[...new Set(fields.map((f) => names[f] ?? f))].join(", ") || "описание из 1С"}`,
    before,
    after,
  });
  return NextResponse.json({ ok: true, changed: true });
}
