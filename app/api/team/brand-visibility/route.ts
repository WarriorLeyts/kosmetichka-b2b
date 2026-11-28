import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { ANGIOPHARM_ID, HIDDEN_BRAND_PREFIX, angiopharmWhere, hiddenBrandIds, invalidateBrandVisibility, isAngiopharm } from "@/lib/brandVisibility";
import { invalidateCatalogMeta } from "@/lib/catalogMetaCache";

export async function GET() {
  if (!(await requireAdminRole())) return NextResponse.json({ error: "Только администратор может управлять видимостью брендов" }, { status: 403 });
  const [brands, counts, angiopharmCount, hidden] = await Promise.all([
    prisma.brand.findMany({ select: { guid: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.groupBy({ by: ["brandGuid"], _count: { _all: true } }),
    prisma.product.count({ where: angiopharmWhere() as Prisma.ProductWhereInput }),
    hiddenBrandIds(),
  ]);
  const count = new Map(counts.map(row => [row.brandGuid, row._count._all]));
  const rows = brands.filter(b => !isAngiopharm(b.name)).map(b => ({ id: b.guid, name: b.name, count: count.get(b.guid) ?? 0, hidden: hidden.includes(b.guid) }));
  rows.push({ id: ANGIOPHARM_ID, name: "Ангиофарм (Angiopharm)", count: angiopharmCount, hidden: hidden.includes(ANGIOPHARM_ID) });
  rows.sort((a, b) => Number(b.hidden) - Number(a.hidden) || a.name.localeCompare(b.name, "ru"));
  return NextResponse.json({ brands: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const admin = await requireAdminRole();
  if (!admin) return NextResponse.json({ error: "Только администратор может управлять видимостью брендов" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id || body.id.length > 100 || typeof body.hidden !== "boolean") return NextResponse.json({ error: "Укажите бренд и действие" }, { status: 400 });
  const brand = body.id === ANGIOPHARM_ID ? { guid: ANGIOPHARM_ID, name: "Ангиофарм (Angiopharm)" } : await prisma.brand.findUnique({ where: { guid: body.id }, select: { guid: true, name: true } });
  if (!brand) return NextResponse.json({ error: "Бренд не найден" }, { status: 404 });
  // Every spelling of Angiopharm is one switch, also including products found only by their name.
  const id = isAngiopharm(brand.name) ? ANGIOPHARM_ID : brand.guid;
  const key = HIDDEN_BRAND_PREFIX + id;
  await prisma.$transaction(async tx => {
    const previous = await tx.cmsSetting.findUnique({ where: { key }, select: { key: true } });
    if (body.hidden) {
      const value = { name: brand.name, hidden: true };
      await tx.cmsSetting.upsert({ where: { key }, create: { key, value, updatedBy: String(admin.email ?? admin.id) }, update: { value, updatedBy: String(admin.email ?? admin.id) } });
    } else await tx.cmsSetting.deleteMany({ where: { key } });
    await tx.adminAuditLog.create({ data: {
      userId: Number(admin.id), userName: String(admin.email ?? "Администратор"),
      action: "brand_visibility", entity: "brand", entityId: id,
      summary: `${body.hidden ? "Скрыт" : "Показан"} бренд «${brand.name}»`,
      before: { hidden: !!previous }, after: { hidden: body.hidden },
    } });
  });
  invalidateBrandVisibility();
  invalidateCatalogMeta();
  return NextResponse.json({ success: true, id, hidden: body.hidden });
}
