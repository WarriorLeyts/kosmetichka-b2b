import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { bannerSchema } from "@/lib/cms/bannerSchema";
import { invalidateHome } from "@/lib/cms/homeCache";

export const dynamic = "force-dynamic";

// GET /api/cms/banners?deleted=1 — баннеры (удалённые — отдельным списком, их можно вернуть)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "banners.edit");
  if (isGuardError(g)) return g;
  const deleted = new URL(request.url).searchParams.get("deleted") === "1";
  const banners = await prisma.banner.findMany({
    where: deleted ? { deletedAt: { not: null } } : { deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ banners });
}

// POST /api/cms/banners — новый баннер
export async function POST(request: Request) {
  const g = await cmsGuard(request, "banners.edit");
  if (isGuardError(g)) return g;
  const data = await parseBody(request, bannerSchema);
  if (data instanceof NextResponse) return data;
  const banner = await prisma.banner.create({ data });
  invalidateHome();
  await logAction(g.user, g.ip, { action: "banner.create", entity: "banner", entityId: banner.id, summary: `Баннер «${banner.title}» создан`, after: banner });
  return NextResponse.json({ banner });
}
