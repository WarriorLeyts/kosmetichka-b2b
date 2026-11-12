import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { blockPageOf, getHomePage } from "@/lib/cms/home";

// GET /api/cms/home/versions — история публикаций главной (новые сверху)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "home.edit");
  if (isGuardError(g)) return g;
  const page = await getHomePage(blockPageOf(request));
  const versions = await prisma.sitePageVersion.findMany({
    where: { pageId: page.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, note: true, createdBy: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}
