import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { ACTION_LABELS, applyChanges, bulkActionSchema, computeChanges } from "@/lib/cms/bulk";
import { productIdsByFilter } from "@/lib/cms/productFilter";

export const maxDuration = 300;

const schema = z.object({
  /** выбранные товары, или filter — строка фильтров таблицы (?search=…) для «всех по фильтру» */
  ids: z.array(z.number().int().positive()).max(20000).optional(),
  filter: z.string().max(2000).optional(),
  action: bulkActionSchema,
  dryRun: z.boolean().default(true),
});

// POST /api/cms/products/bulk — массовое изменение: dryRun → предпросмотр; иначе применить (с записью для отмены)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const ids = body.ids?.length ? body.ids : body.filter !== undefined ? await productIdsByFilter(new URLSearchParams(body.filter)) : [];
  if (!ids.length) return NextResponse.json({ error: "Не выбрано ни одного товара" }, { status: 400 });
  let result;
  try {
    result = await computeChanges(ids, body.action);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
  if (body.dryRun) return NextResponse.json({ preview: result.preview });
  if (!result.changes.length) return NextResponse.json({ error: "Изменять нечего — " + (result.preview.skipped.map((s) => `${s.reason}: ${s.count}`).join(", ") || "нет товаров") }, { status: 400 });
  const summary = `${ACTION_LABELS[body.action.type]}: изменено ${result.changes.length} из ${ids.length}`;
  const op = await applyChanges(result.changes, body.action, summary, g.user.name || g.user.login);
  if (body.action.type === "visibility") revalidatePath("/sitemap.xml");
  await logAction(g.user, g.ip, { action: `bulk.${body.action.type}`, entity: "operation", entityId: op.id, summary, after: { action: body.action, count: result.changes.length } });
  return NextResponse.json({ ok: true, operationId: op.id, changed: result.changes.length });
}
