import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productImages, requireStaffEditor } from "@/lib/academy";
import { normalizeCode } from "@/lib/academy-tests";

export const dynamic = "force-dynamic";

type Found = { id: number; name: string; article: string | null; barcode: string | null };

/**
 * Товар для вопроса теста — по коду номенклатуры 1С (ЦБ000012380), штрихкоду или номеру на сайте.
 * Если по коду точного совпадения нет и введено ≥3 символов — до 8 товаров по названию.
 */
export async function GET(request: Request) {
  if (!(await requireStaffEditor())) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const raw = (new URL(request.url).searchParams.get("code") ?? "").trim().slice(0, 100);
  const code = normalizeCode(raw);
  if (!code) return NextResponse.json({ items: [], exact: false });

  const select = { id: true, name: true, article: true, barcode: true } as const;
  let items: Found[] = await prisma.product.findMany({
    where: {
      OR: [
        { article: { equals: code, mode: "insensitive" } },
        { barcode: code },
        ...(/^\d{1,9}$/.test(code) ? [{ id: Number(code) }] : []),
      ],
    },
    select,
    take: 8,
  });
  const exact = items.length > 0;

  if (!exact && raw.length >= 3) {
    items = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: raw, mode: "insensitive" } },
          { article: { contains: code, mode: "insensitive" } },
        ],
      },
      orderBy: [{ salesCount: "desc" }, { id: "asc" }],
      select,
      take: 8,
    });
  }

  const images = await productImages(items.map((p) => p.id));
  return NextResponse.json({
    exact,
    items: items.map((p) => ({ ...p, image: images.get(p.id) ?? null })),
  });
}
