import { NextResponse } from "next/server";
import { z } from "zod";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { enqueueJob } from "@/lib/cms/jobs";
import { readAnalysis, sessionOwner } from "@/lib/cms/photoImport";

const MODES = { skip: "пропустить товары с фото", add: "добавить к текущим", replace: "заменить текущие" } as const;

// POST /api/cms/photos/session/:sid/start {mode} — поставить загрузку в очередь (фоновая обработка)
export async function POST(request: Request, { params }: { params: Promise<{ sid: string }> }) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const { sid } = await params;
  if (sessionOwner(sid) !== g.user.id) return NextResponse.json({ error: "Загрузка не найдена" }, { status: 404 });
  const body = await parseBody(request, z.object({ mode: z.enum(["skip", "add", "replace"]) }));
  if (body instanceof NextResponse) return body;
  const a = readAnalysis(sid);
  if (!a) return NextResponse.json({ error: "Сначала разберите файлы" }, { status: 400 });
  if (!a.plan.length) return NextResponse.json({ error: "Ни одно фото не подошло к товару" }, { status: 400 });
  const photos = a.plan.reduce((s, p) => s + p.files.length, 0);
  const user = { id: g.user.id, name: g.user.name || g.user.login };
  const job = await enqueueJob("photos", `Фото: ${a.plan.length} товаров, ${photos} файлов (${MODES[body.mode]})`, { sid, mode: body.mode }, user);
  await logAction(g.user, g.ip, { action: "photos.import", entity: "job", entityId: job.id, summary: `Загрузка фото поставлена в очередь: товаров ${a.plan.length}, файлов ${photos}, режим «${MODES[body.mode]}»` });
  return NextResponse.json({ jobId: job.id });
}

