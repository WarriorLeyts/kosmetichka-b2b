import { NextResponse } from "next/server";
import { z } from "zod";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { parseBody } from "@/lib/cms/validate";
import { resolveBlocks } from "@/lib/cms/home";
import { blockSchema } from "@/lib/cms/homeSchema";

// POST /api/cms/home/preview {blocks} — данные для предпросмотра (баннеры, категории, карточки товаров)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "home.edit");
  if (isGuardError(g)) return g;
  // в предпросмотр идёт и недописанный черновик — проверяем блоки по одному, кривые пропускаем
  const body = await parseBody(request, z.object({ blocks: z.array(z.unknown()).max(40) }));
  if (body instanceof NextResponse) return body;
  const blocks = body.blocks.map((b) => blockSchema.safeParse(b)).flatMap((r) => (r.success ? [r.data] : []));
  const resolved = await resolveBlocks({ version: 1, blocks }, { withPreview: true, keepEmpty: true });
  return NextResponse.json({ blocks: resolved });
}
