import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { resolveImageUrl } from "@/lib/image";
import { PROMO_SETTINGS_KEY, promoSchema, readPromo } from "@/lib/promoSchema";

export const dynamic = "force-dynamic";

// GET /api/cms/settings/promo — настройки акции + баннеры для выбора
export async function GET(request: Request) {
  const g = await cmsGuard(request, "cms.access");
  if (isGuardError(g)) return g;
  const [row, banners] = await Promise.all([
    prisma.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } }),
    prisma.banner.findMany({ where: { deletedAt: null }, orderBy: { id: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    settings: readPromo(row?.value),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    banners: banners.map((b) => ({
      id: b.id,
      title: b.title,
      active: b.active,
      image: resolveImageUrl(b.imageDesktop ?? b.imageMobile, 480),
      imageMobile: resolveImageUrl(b.imageMobile ?? b.imageDesktop, 240),
      hasDesktop: !!b.imageDesktop,
      hasMobile: !!b.imageMobile,
      link: b.link,
    })),
  });
}

// PUT /api/cms/settings/promo — сохранить (сайт и приложения подхватывают в течение минуты)
export async function PUT(request: Request) {
  const g = await cmsGuard(request, "settings.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, promoSchema);
  if (body instanceof NextResponse) return body;
  const who = g.user.name || g.user.login;
  const before = await prisma.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } });
  await prisma.cmsSetting.upsert({
    where: { key: PROMO_SETTINGS_KEY },
    update: { value: body as unknown as Prisma.InputJsonValue, updatedBy: who },
    create: { key: PROMO_SETTINGS_KEY, value: body as unknown as Prisma.InputJsonValue, updatedBy: who },
  });
  const when = (s: string | null) => (s ? new Date(s).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "—");
  await logAction(g.user, g.ip, {
    action: "settings.promo",
    entity: "setting",
    entityId: PROMO_SETTINGS_KEY,
    summary: `Акция «${body.name || "без названия"}»: ${body.enabled ? "включена" : "выключена"}, ${when(body.startsAt)} — ${when(body.endsAt)}`,
    before: before?.value,
    after: body,
  });
  return NextResponse.json({ ok: true });
}
