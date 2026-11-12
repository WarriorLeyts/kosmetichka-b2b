import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { saveUpload, sessionOwner, UploadRejected } from "@/lib/cms/photoImport";

export const maxDuration = 900;

// PUT /api/cms/photos/session/:sid?name=файл — один файл (фото, ZIP или XLSX) телом запроса, пишется на диск потоком
export async function PUT(request: Request, { params }: { params: Promise<{ sid: string }> }) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const { sid } = await params;
  if (sessionOwner(sid) !== g.user.id) return NextResponse.json({ error: "Загрузка не найдена" }, { status: 404 });
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!request.body) return NextResponse.json({ error: "Пустой файл" }, { status: 400 });
  try {
    return NextResponse.json(await saveUpload(sid, name, request.body));
  } catch (e) {
    if (e instanceof UploadRejected) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
