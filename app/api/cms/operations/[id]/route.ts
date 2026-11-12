import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { undoOperation } from "@/lib/cms/bulk";

export const maxDuration = 300;

// POST /api/cms/operations/:id — отменить массовую операцию (там, где товар с тех пор не меняли)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const id = Number((await params).id);
  try {
    const r = await undoOperation(id, g.user.name || g.user.login);
    await logAction(g.user, g.ip, { action: "bulk.undo", entity: "operation", entityId: id, summary: `Отменена массовая операция #${id}: возвращено ${r.restored}, пропущено (меняли после) ${r.conflicts}` });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
