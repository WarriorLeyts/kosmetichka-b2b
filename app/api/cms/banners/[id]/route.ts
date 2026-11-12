import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { bannerSchema } from "@/lib/cms/bannerSchema";
import { invalidateHome } from "@/lib/cms/homeCache";
import { getHomePage, readContent } from "@/lib/cms/home";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? prisma.banner.findUnique({ where: { id } }) : null;
}

// PUT /api/cms/banners/:id — изменить баннер
export async function PUT(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "banners.edit");
  if (isGuardError(g)) return g;
  const before = await load(ctx);
  if (!before || before.deletedAt) return NextResponse.json({ error: "Баннер не найден" }, { status: 404 });
  const data = await parseBody(request, bannerSchema);
  if (data instanceof NextResponse) return data;
  const banner = await prisma.banner.update({ where: { id: before.id }, data });
  invalidateHome();
  await logAction(g.user, g.ip, { action: "banner.update", entity: "banner", entityId: banner.id, summary: `Баннер «${banner.title}» изменён`, before, after: banner });
  return NextResponse.json({ banner });
}

// DELETE /api/cms/banners/:id — в корзину (не стирается: можно вернуть)
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "banners.delete");
  if (isGuardError(g)) return g;
  const before = await load(ctx);
  if (!before || before.deletedAt) return NextResponse.json({ error: "Баннер не найден" }, { status: 404 });
  // баннер, стоящий на опубликованной главной или в каталоге, не удаляем молча
  const usedOn: string[] = [];
  for (const key of ["home", "catalog"] as const) {
    const page = await getHomePage(key);
    if (page.published && readContent(page.published, key).blocks.some((b) => b.type === "hero" && b.bannerIds.includes(before.id))) usedOn.push(key === "home" ? "главной" : "в каталоге");
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (usedOn.length && !force) {
    return NextResponse.json({ error: `Баннер стоит на опубликованной странице (${usedOn.join(", ")}). Удалить всё равно?`, inUse: true }, { status: 409 });
  }
  await prisma.banner.update({ where: { id: before.id }, data: { deletedAt: new Date(), active: false } });
  invalidateHome();
  await logAction(g.user, g.ip, { action: "banner.delete", entity: "banner", entityId: before.id, summary: `Баннер «${before.title}» удалён в корзину`, before });
  return NextResponse.json({ ok: true });
}

// POST /api/cms/banners/:id {action:"restore"} — вернуть из корзины (выключенным)
export async function POST(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "banners.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ action: z.literal("restore") }));
  if (body instanceof NextResponse) return body;
  const before = await load(ctx);
  if (!before || !before.deletedAt) return NextResponse.json({ error: "Баннер не найден в корзине" }, { status: 404 });
  const banner = await prisma.banner.update({ where: { id: before.id }, data: { deletedAt: null } });
  await logAction(g.user, g.ip, { action: "banner.restore", entity: "banner", entityId: banner.id, summary: `Баннер «${banner.title}» возвращён из корзины` });
  return NextResponse.json({ banner });
}
