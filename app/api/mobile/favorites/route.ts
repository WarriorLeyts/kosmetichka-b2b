import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { cleanPromoSnapshot } from "@/lib/pricing";

/** the most products one list keeps, and the size of what is stored */
const MAX_ITEMS = 1000;
const MAX_BYTES = 600_000;

/** One favourite product as the apps keep it (a slim product); anything else is dropped. */
function cleanItem(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const id = Number(l.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const out: Record<string, unknown> = { id };
  if (typeof l.name === "string") out.name = l.name.slice(0, 500);
  for (const k of ["stock", "minOrderQty", "retailPrice", "discountPrice", "wholesalePrice", "bigWholesalePrice"]) if (typeof l[k] === "number" && Number.isFinite(l[k])) out[k] = l[k];
  if (Array.isArray(l.images)) out.images = (l.images as unknown[]).slice(0, 1).filter((x) => x && typeof x === "object" && typeof (x as { path?: unknown }).path === "string").map((x) => ({ path: String((x as { path: string }).path).slice(0, 300) }));
  if (l.brand && typeof l.brand === "object" && typeof (l.brand as { name?: unknown }).name === "string") out.brand = { name: String((l.brand as { name: string }).name).slice(0, 200) };
  return { ...out, ...cleanPromoSnapshot(l) };
}

/** GET /api/mobile/favorites — the customer's favourites saved on the server ({ items: [], updatedAt: null } when none). */
export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const f = await prisma.customerFavorites.findUnique({ where: { customerId: id } });
  return NextResponse.json({ items: f?.items ?? [], updatedAt: f?.updatedAt.toISOString() ?? null });
}

/** PUT /api/mobile/favorites { items } — saves the whole list for all the customer's devices. */
export async function PUT(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: "Нужен список товаров" }, { status: 400 });
  const seen = new Set<unknown>();
  const items = (body.items as unknown[])
    .map(cleanItem)
    .filter((x): x is Record<string, unknown> => !!x && !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, MAX_ITEMS);
  if (JSON.stringify(items).length > MAX_BYTES) return NextResponse.json({ error: "Слишком много товаров" }, { status: 413 });
  const f = await prisma.customerFavorites.upsert({
    where: { customerId: id },
    create: { customerId: id, items: items as object[] },
    update: { items: items as object[] },
  });
  return NextResponse.json({ updatedAt: f.updatedAt.toISOString(), count: items.length });
}

