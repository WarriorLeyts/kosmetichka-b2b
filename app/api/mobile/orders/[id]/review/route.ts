import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../../_auth";

const bodySchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });
type Context = { params: Promise<{ id: string }> };
async function owner(context: Context) {
  const customerId = await currentCustomerId();
  if (!customerId) return { error: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return { error: NextResponse.json({ error: "Заказ не найден" }, { status: 404 }) };
  const order = await prisma.order.findFirst({ where: { id, customerId }, select: { id: true } });
  if (!order) return { error: NextResponse.json({ error: "Заказ не найден" }, { status: 404 }) };
  return { id };
}
export async function GET(_request: Request, context: Context) {
  const owned = await owner(context);
  if (owned.error) return owned.error;
  return NextResponse.json({ review: await prisma.orderReview.findUnique({ where: { orderId: owned.id } }) });
}
export async function POST(request: Request, context: Context) {
  const owned = await owner(context);
  if (owned.error) return owned.error;
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Нужен JSON" }, { status: 415 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Выберите от 1 до 5 звёзд. Комментарий — до 500 символов." }, { status: 400 });
  try {
    const review = await prisma.orderReview.create({ data: { orderId: owned.id, rating: parsed.data.rating, comment: parsed.data.comment || null } });
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? e.code : null;
    // A lost reply / repeated tap must return the first saved review, never replace it.
    if (code === "P2002") return NextResponse.json({ review: await prisma.orderReview.findUnique({ where: { orderId: owned.id } }) });
    if (code === "P2003") return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    throw e;
  }
}
