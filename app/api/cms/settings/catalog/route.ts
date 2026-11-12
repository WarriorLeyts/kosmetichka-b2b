import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { resolveImageUrl } from "@/lib/image";
import { CATALOG_SETTINGS_KEY, catalogSettingsSchema, categorySlugs, orderCategories, readCatalogSettings, resetCatalogSettingsCache } from "@/lib/catalogSettings";
import { invalidateCatalogMeta } from "@/lib/catalogMetaCache";

export const dynamic = "force-dynamic";

// GET /api/cms/settings/catalog — настройки каталога + дерево категорий (для порядка, картинок и SEO)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const [row, cats, counts] = await Promise.all([
    prisma.cmsSetting.findUnique({ where: { key: CATALOG_SETTINGS_KEY } }),
    prisma.category.findMany({ select: { guid: true, name: true, sortOrder: true, parentGuid: true } }),
    prisma.product.groupBy({ by: ["categoryGuid"], where: { hidden: false }, _count: { _all: true } }),
  ]);
  const s = readCatalogSettings(row?.value);
  const slugs = categorySlugs(cats);
  const n = new Map(counts.map((c) => [c.categoryGuid, c._count._all]));
  return NextResponse.json({
    settings: s,
    imageUrls: Object.fromEntries(Object.entries(s.categories.images).map(([g, p]) => [g, resolveImageUrl(p, 320)])),
    categories: orderCategories(cats, s).map((c) => ({ ...c, slug: slugs.get(c.guid), products: n.get(c.guid) ?? 0 })),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  });
}

// PUT /api/cms/settings/catalog — сохранить (сайт и приложения подхватывают в течение 5 минут)
export async function PUT(request: Request) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, catalogSettingsSchema);
  if (body instanceof NextResponse) return body;
  const known = new Set((await prisma.category.findMany({ select: { guid: true } })).map((c) => c.guid));
  // only real categories; empty SEO entries are not kept
  const clean = {
    ...body,
    categories: {
      order: body.categories.order.filter((x) => known.has(x)),
      hidden: body.categories.hidden.filter((x) => known.has(x)),
      images: Object.fromEntries(Object.entries(body.categories.images).filter(([k]) => known.has(k))),
    },
    seo: {
      catalog: body.seo.catalog,
      categories: Object.fromEntries(Object.entries(body.seo.categories).filter(([k, v]) => known.has(k) && (v.title || v.description || v.text))),
    },
  };
  const who = g.user.name || g.user.login;
  const before = await prisma.cmsSetting.findUnique({ where: { key: CATALOG_SETTINGS_KEY } });
  await prisma.cmsSetting.upsert({
    where: { key: CATALOG_SETTINGS_KEY },
    update: { value: clean as unknown as Prisma.InputJsonValue, updatedBy: who },
    create: { key: CATALOG_SETTINGS_KEY, value: clean as unknown as Prisma.InputJsonValue, updatedBy: who },
  });
  resetCatalogSettingsCache();
  invalidateCatalogMeta();
  await logAction(g.user, g.ip, { action: "settings.catalog", entity: "setting", entityId: CATALOG_SETTINGS_KEY, summary: "Изменены настройки каталога", before: before?.value, after: clean });
  return NextResponse.json({ ok: true });
}
