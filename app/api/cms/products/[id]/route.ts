import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { productPatchSchema } from "@/lib/cms/productSchema";
import { resolveImageUrl } from "@/lib/image";
import { productPath, slugify } from "@/lib/productSlug";

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
          brand: { select: { name: true, guid: true } },
          category: { select: { name: true, guid: true } },
          images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { _count: { select: { variants: true } } } },
          prices: { select: { priceType: true, price: true, updatedAt: true } },
          warehouseStock: { select: { qty: true, warehouse: { select: { name: true } } } },
          barcodes: { select: { barcode: true, unitName: true } },
        },
      })
    : null;
  if (!p) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const [related, cat1C, brand1C] = await Promise.all([
    p.relatedIds.length
      ? prisma.product.findMany({ where: { id: { in: p.relatedIds } }, select: { id: true, name: true, article: true, hidden: true, images: { take: 1, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { path: true } } } })
      : Promise.resolve([]),
    p.categoryGuid1C ? prisma.category.findUnique({ where: { guid: p.categoryGuid1C }, select: { name: true } }) : Promise.resolve(null),
    p.brandGuid1C ? prisma.brand.findUnique({ where: { guid: p.brandGuid1C }, select: { name: true } }) : Promise.resolve(null),
  ]);
  const relById = new Map(related.map((r) => [r.id, r]));
  return NextResponse.json({
    product: {
      id: p.id,
      guid: p.guid,
      article: p.article,
      barcode: p.barcode,
      barcodes: p.barcodes,
      name: p.name,
      brand: p.brand,
      category: p.category,
      categoryManual: p.categoryManual,
      brandManual: p.brandManual,
      category1C: cat1C?.name ?? null,
      brand1C: brand1C?.name ?? null,
      description: p.description,
      descriptionManual: p.descriptionManual,
      shortDescription: p.shortDescription,
      features: p.features,
      usage: p.usage,
      composition: p.composition,
      skinType: p.skinType,
      country: p.country,
      specs: Array.isArray(p.specs) ? p.specs : [],
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      seoSource: p.seoSource,
      slug: p.slug,
      suggestedSlug: slugify(p.name),
      canonicalUrl: p.canonicalUrl,
      path: productPath(p),
      hidden: p.hidden,
      labels: p.labels,
      stock: p.stock,
      wholesaleStock: p.wholesaleStock,
      salesCount: p.salesCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      prices: p.prices,
      warehouses: p.warehouseStock.map((w) => ({ name: w.warehouse.name, qty: w.qty })),
      images: p.images.map((i) => ({
        id: i.id,
        path: i.path,
        url: resolveImageUrl(i.path, 480),
        full: resolveImageUrl(i.path),
        alt: i.alt,
        original: i.original ? resolveImageUrl(i.original) : null,
        fromAdmin: i.path.startsWith("uploads/"),
        usedByVariants: i._count.variants,
      })),
      related: p.relatedIds
        .map((rid) => relById.get(rid))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ id: r.id, name: r.name, article: r.article, hidden: r.hidden, image: resolveImageUrl(r.images[0]?.path, 160) })),
    },
    canEdit: can(g.user, "products.edit"),
  });
}

const FIELD_NAMES: Record<string, string> = {
  description: "описание",
  shortDescription: "краткое описание",
  features: "особенности",
  usage: "применение",
  composition: "состав",
  skinType: "тип кожи/волос",
  country: "страна",
  specs: "характеристики",
  seoTitle: "SEO",
  seoDescription: "SEO",
  slug: "ЧПУ",
  canonicalUrl: "canonical",
  hidden: "видимость",
  labels: "метки",
  relatedIds: "сопутствующие",
  categoryGuid: "категория",
  brandGuid: "бренд",
  categoryManual: "категория из 1С",
  brandManual: "бренд из 1С",
  descriptionManual: "описание из 1С",
};

// PATCH /api/cms/products/:id — данные сайта (цены, остатки, название, артикул, штрихкод — только из 1С)
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const id = await idOf(ctx);
  const before = id ? await prisma.product.findUnique({ where: { id } }) : null;
  if (!before) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const body = await parseBody(request, productPatchSchema);
  if (body instanceof NextResponse) return body;

  const data: Prisma.ProductUpdateInput = {};
  const nul = (v: string | null | undefined) => (v && v.trim() ? v : null);
  if (body.description !== undefined && nul(body.description) !== before.description) {
    data.description = nul(body.description);
    data.descriptionManual = true;
  }
  if (body.descriptionFrom1C) data.descriptionManual = false;
  for (const k of ["shortDescription", "features", "usage", "composition", "skinType", "country"] as const) {
    if (body[k] !== undefined && nul(body[k]) !== before[k]) data[k] = nul(body[k]);
  }
  if (body.specs !== undefined) data.specs = body.specs as Prisma.InputJsonValue;
  if (body.seoTitle !== undefined && nul(body.seoTitle) !== before.seoTitle) data.seoTitle = nul(body.seoTitle);
  if (body.seoDescription !== undefined && nul(body.seoDescription) !== before.seoDescription) data.seoDescription = nul(body.seoDescription);
  if ("seoTitle" in data || "seoDescription" in data) data.seoSource = "manual";
  if (body.slug !== undefined && nul(body.slug) !== before.slug) data.slug = nul(body.slug);
  if (body.canonicalUrl !== undefined && nul(body.canonicalUrl) !== before.canonicalUrl) data.canonicalUrl = nul(body.canonicalUrl);
  if (body.hidden !== undefined && body.hidden !== before.hidden) data.hidden = body.hidden;
  if (body.labels !== undefined) data.labels = [...new Set(body.labels)];
  if (body.relatedIds !== undefined) {
    const uniq = [...new Set(body.relatedIds)].filter((x) => x !== before.id);
    const exist = new Set((await prisma.product.findMany({ where: { id: { in: uniq } }, select: { id: true } })).map((p) => p.id));
    data.relatedIds = uniq.filter((x) => exist.has(x));
  }
  if (body.categoryGuid !== undefined && body.categoryGuid !== before.categoryGuid) {
    if (!(await prisma.category.findUnique({ where: { guid: body.categoryGuid }, select: { guid: true } })))
      return NextResponse.json({ error: "Категория не найдена" }, { status: 400 });
    data.category = { connect: { guid: body.categoryGuid } };
    data.categoryManual = true;
  }
  if (body.categoryFrom1C) {
    data.categoryManual = false;
    data.category = before.categoryGuid1C ? { connect: { guid: before.categoryGuid1C } } : { disconnect: true };
  }
  if (body.brandGuid !== undefined && body.brandGuid !== before.brandGuid) {
    if (body.brandGuid && !(await prisma.brand.findUnique({ where: { guid: body.brandGuid }, select: { guid: true } })))
      return NextResponse.json({ error: "Бренд не найден" }, { status: 400 });
    data.brand = body.brandGuid ? { connect: { guid: body.brandGuid } } : { disconnect: true };
    data.brandManual = true;
  }
  if (body.brandFrom1C) {
    data.brandManual = false;
    data.brand = before.brandGuid1C ? { connect: { guid: before.brandGuid1C } } : { disconnect: true };
  }

  let altChanged = 0;
  if (body.imageAlts?.length) {
    const own = await prisma.productImage.findMany({ where: { productId: before.id }, select: { id: true, alt: true } });
    const byId = new Map(own.map((i) => [i.id, i.alt ?? ""]));
    for (const a of body.imageAlts) {
      if (!byId.has(a.id) || byId.get(a.id) === a.alt) continue;
      await prisma.productImage.update({ where: { id: a.id }, data: { alt: a.alt || null } });
      altChanged++;
    }
  }
  if (!Object.keys(data).length && !altChanged) return NextResponse.json({ ok: true, changed: false });

  // ЧПУ не должен совпадать с чужим
  if (typeof data.slug === "string" && (await prisma.product.findFirst({ where: { slug: data.slug, id: { not: before.id } }, select: { id: true } }))) {
    return NextResponse.json({ error: "Такой ЧПУ уже у другого товара" }, { status: 409 });
  }

  const after = Object.keys(data).length ? await prisma.product.update({ where: { id: before.id }, data }) : before;
  revalidatePath(`/product/${before.id}`);
  if (before.slug) revalidatePath(productPath(before));
  if (after.slug) revalidatePath(productPath(after));
  revalidatePath("/sitemap.xml");
  const fields = [...new Set(Object.keys(data).filter((k) => k !== "seoSource").map((k) => FIELD_NAMES[k] ?? k))];
  if (altChanged) fields.push("alt-тексты фото");
  const pick = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(data).filter((k) => k in o).map((k) => [k, o[k]]));
  await logAction(g.user, g.ip, {
    action: "product.update",
    entity: "product",
    entityId: before.id,
    summary: `Товар «${before.name}»: ${fields.join(", ")}`,
    before: pick(before as unknown as Record<string, unknown>),
    after: pick(after as unknown as Record<string, unknown>),
  });
  return NextResponse.json({ ok: true, changed: true });
}
