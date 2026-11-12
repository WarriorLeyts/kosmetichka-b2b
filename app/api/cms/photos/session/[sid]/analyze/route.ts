import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { analyze, sessionOwner } from "@/lib/cms/photoImport";

export const maxDuration = 300;

// POST /api/cms/photos/session/:sid/analyze — какие фото к каким товарам (ничего не меняет)
export async function POST(request: Request, { params }: { params: Promise<{ sid: string }> }) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const { sid } = await params;
  if (sessionOwner(sid) !== g.user.id) return NextResponse.json({ error: "Загрузка не найдена" }, { status: 404 });
  return NextResponse.json(await analyze(sid));
}
