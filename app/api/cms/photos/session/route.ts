import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { newSession } from "@/lib/cms/photoImport";

// POST /api/cms/photos/session — новая загрузка фото (папка на сервере для файлов этой загрузки)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  return NextResponse.json({ sid: newSession(g.user.id) });
}
