import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";

export const dynamic = "force-dynamic";

// GET /api/cms/operations — история массовых операций
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const ops = await prisma.cmsBulkOperation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, summary: true, count: true, userName: true, createdAt: true, undoneAt: true, undoneBy: true },
  });
  return NextResponse.json({ operations: ops });
}
