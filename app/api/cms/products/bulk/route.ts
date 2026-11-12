import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), action: z.enum(["hide", "show"]) });

// POST /api/cms/products/bulk {ids, action} — скрыть / показать сразу много товаров
export async function POST(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const hidden = body.action === "hide";
  const r = await prisma.product.updateMany({ where: { id: { in: body.ids }, hidden: !hidden }, data: { hidden } });
  for (const id of body.ids) revalidatePath(`/product/${id}`);
  await logAction(g.user, g.ip, {
    action: hidden ? "product.hide" : "product.show",
    entity: "product",
    summary: `${hidden ? "Скрыто" : "Показано"} товаров: ${r.count}`,
    after: { ids: body.ids },
  });
  return NextResponse.json({ ok: true, changed: r.count });
}
