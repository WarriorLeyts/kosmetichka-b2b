import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";

export const dynamic = "force-dynamic";

// GET /api/cms/jobs — фоновые задачи (последние 30)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const jobs = await prisma.cmsJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, type: true, status: true, title: true, total: true, done: true, failed: true, attempts: true, createdBy: true, createdAt: true, startedAt: true, finishedAt: true },
  });
  return NextResponse.json({ jobs });
}
