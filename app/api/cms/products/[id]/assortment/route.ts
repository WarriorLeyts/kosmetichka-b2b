import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { assortmentSchema, getAssortment, saveAssortment } from "@/lib/assortment";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Ctx) {
  const g = await cmsGuard(request, "products.edit"); if (isGuardError(g)) return g;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Некорректный товар" }, { status: 400 });
  const result = await getAssortment(id);
  return NextResponse.json(result ?? { error: "Товар не найден" }, { status: result ? 200 : 404 });
}
export async function PUT(request: Request, { params }: Ctx) {
  const g = await cmsGuard(request, "products.edit"); if (isGuardError(g)) return g;
  const id = Number((await params).id);
  const parsed = assortmentSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) return NextResponse.json({ error: parsed.success ? "Некорректный товар" : parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await saveAssortment(id, parsed.data);
    await logAction(g.user, g.ip, { action: "product.update", entity: "product", entityId: id, summary: "Настройка ассортимента по фото" });
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить" }, { status: 400 }); }
}
