import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { resolveImageUrl } from "@/lib/image";
import { PROMO_SETTINGS_KEY, promoSchema, readPromo, editablePromo } from "@/lib/promoSchema";

export const dynamic = "force-dynamic";

// GET /api/cms/settings/promo — настройки акции + баннеры для выбора
export async function GET(request: Request) {
  const g = await cmsGuard(request, "cms.access");
  if (isGuardError(g)) return g;
  const [row, draft, banners] = await Promise.all([
    prisma.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } }),
    prisma.cmsSetting.findUnique({ where: { key: "promo_draft" } }),
    prisma.banner.findMany({ where: { deletedAt: null }, orderBy: { id: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    settings: editablePromo(readPromo(draft?.value ?? row?.value)),
    published: readPromo(row?.value),
    hasDraft: !!draft,
    revision: row?.updatedAt.toISOString() ?? null,
    draftRevision: draft?.updatedAt.toISOString() ?? null,
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

const mutationSchema = z.object({
  action: z.enum(["draft", "publish"]),
  settings: promoSchema,
  revision: z.string().nullable(),
  draftRevision: z.string().nullable(),
});

export async function PUT(request: Request) {
  const g = await cmsGuard(request, "settings.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, mutationSchema);
  if (body instanceof NextResponse) return body;
  const { settings, action } = body;
  if (!settings.pricing) return NextResponse.json({ error: "Укажите условия акции" }, { status: 400 });
  if (action === "publish" && settings.enabled && (!settings.name || !settings.startsAt || !settings.endsAt))
    return NextResponse.json({ error: "Для запуска укажите название, первый и последний день" }, { status: 400 });
  const who = g.user.name || g.user.login;
  let before: unknown;
  try {
    await prisma.$transaction(async tx => {
      const published = await tx.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } });
      const draft = await tx.cmsSetting.findUnique({ where: { key: "promo_draft" } });
      if ((published?.updatedAt.toISOString() ?? null) !== body.revision || (draft?.updatedAt.toISOString() ?? null) !== body.draftRevision)
        throw new Error("PROMO_CONFLICT");
      const key = action === "publish" ? PROMO_SETTINGS_KEY : "promo_draft";
      before = action === "publish" ? published?.value : draft?.value;
      await tx.cmsSetting.upsert({ where: { key },
        update: { value: settings as unknown as Prisma.InputJsonValue, updatedBy: who },
        create: { key, value: settings as unknown as Prisma.InputJsonValue, updatedBy: who } });
      if (action === "publish") await tx.cmsSetting.deleteMany({ where: { key: "promo_draft" } });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    if ((e instanceof Error && e.message === "PROMO_CONFLICT") || (e as { code?: string }).code === "P2034")
      return NextResponse.json({ error: "Настройки уже изменил другой сотрудник. Обновите страницу и проверьте изменения." }, { status: 409 });
    throw e;
  }
  await logAction(g.user, g.ip, { action: `settings.promo.${action}`, entity: "setting", entityId: PROMO_SETTINGS_KEY,
    summary: `${action === "publish" ? "Опубликована акция" : "Сохранён черновик"} «${settings.name || "без названия"}»: ${settings.enabled ? "включена" : "выключена"}`,
    before, after: settings });
  return GET(request);
}
