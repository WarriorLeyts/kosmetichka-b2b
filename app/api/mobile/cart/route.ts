import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";

/** the most lines one cart keeps, and the size of what is stored */
const MAX_LINES = 300;
const MAX_BYTES = 400_000;

/** One cart line as the apps keep it; anything else in the body is dropped. */
function cleanLine(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const id = Number(l.id);
  const quantity = Math.floor(Number(l.quantity));
  const cartKey = typeof l.cartKey === "string" ? l.cartKey.slice(0, 60) : "";
  if (!Number.isInteger(id) || id <= 0 || !cartKey || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return null;
  const out: Record<string, unknown> = { id, cartKey, quantity };
  for (const k of ["name", "barcode", "article", "variantName", "variantImageUrl"]) if (typeof l[k] === "string") out[k] = (l[k] as string).slice(0, 500);
  for (const k of ["stock", "minOrderQty", "retailPrice", "discountPrice", "wholesalePrice", "bigWholesalePrice", "variantId"]) if (typeof l[k] === "number" && Number.isFinite(l[k])) out[k] = l[k];
  if (Array.isArray(l.images)) out.images = (l.images as unknown[]).slice(0, 1).filter((x) => x && typeof x === "object" && typeof (x as { path?: unknown }).path === "string").map((x) => ({ path: String((x as { path: string }).path).slice(0, 300) }));
  if (l.brand && typeof l.brand === "object" && typeof (l.brand as { name?: unknown }).name === "string") out.brand = { name: String((l.brand as { name: string }).name).slice(0, 200) };
  return out;
}

/** GET /api/mobile/cart — the customer's cart saved on the server ({ items: [], updatedAt: null } when none). */
export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const c = await prisma.customerCart.findUnique({ where: { customerId: id } });
  return NextResponse.json({ items: c?.items ?? [], comment: c?.comment ?? "", updatedAt: c?.updatedAt.toISOString() ?? null });
}

/** PUT /api/mobile/cart { items, comment } — saves the cart (the whole of it) for all the customer's devices. */
export async function PUT(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: "Нужен список товаров" }, { status: 400 });
  const items = (body.items as unknown[]).map(cleanLine).filter((x): x is Record<string, unknown> => !!x).slice(0, MAX_LINES);
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : "";
  if (JSON.stringify(items).length > MAX_BYTES) return NextResponse.json({ error: "Корзина слишком большая" }, { status: 413 });
  const c = await prisma.customerCart.upsert({
    where: { customerId: id },
    create: { customerId: id, items: items as object[], comment },
    update: { items: items as object[], comment },
  });
  return NextResponse.json({ updatedAt: c.updatedAt.toISOString(), count: items.length });
}
