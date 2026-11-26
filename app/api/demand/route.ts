import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../mobile/_auth";
import { demandId, demandName, demandQuantity, demandSameOrigin, DEMAND_NOTICE } from "@/lib/customerDemand";
import { RateLimiter } from "@/lib/rateLimit";
import { demandPhotoOwned } from "./photo/storage";
import { access } from "fs/promises";
import { demandPhotoPath } from "./photo/storage";
const limiter = new RateLimiter({ windowMs: 3600000, max: 60 });

export async function GET() {
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const items = await prisma.productWish.findMany({ where: { customerId }, orderBy: { updatedAt: "desc" }, take: 100,
    select: { id: true, name: true, quantity: true, comment: true, photoName: true, linkedProductId: true, closed: true, createdAt: true } });
  return NextResponse.json({ items, notice: DEMAND_NOTICE }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!limiter.check(String(customerId)).ok) return NextResponse.json({ error: "Слишком много запросов. Попробуйте позже." }, { status: 429 });
  const b = (await request.json().catch(() => null)) ?? {};
  const title = demandName(b.name), quantity = demandQuantity(b.quantity);
  if (!title || !quantity || (b.comment != null && (typeof b.comment !== "string" || b.comment.length > 1000))) return NextResponse.json({ error: "Укажите название (2–160 символов) и количество от 1 до 10 000" }, { status: 400 });
  if (b.photoName != null) {
    if (!demandPhotoOwned(b.photoName, customerId)) return NextResponse.json({ error: "Недопустимое фото" }, { status: 400 });
    try { await access(demandPhotoPath(b.photoName)); } catch { return NextResponse.json({ error: "Загрузите фото повторно" }, { status: 400 }); }
  }
  const where = { customerId_nameKey: { customerId, nameKey: title.key } };
  const existing = await prisma.productWish.findUnique({ where });
  if (existing?.linkedProductId) return NextResponse.json({ error: "Товар уже добавлен в ваш лист ожидания. Измените количество там." }, { status: 409 });
  if (!existing && await prisma.productWish.count({ where: { customerId, closed: false } }) >= 100) return NextResponse.json({ error: "В листе уже 100 пожеланий. Удалите неактуальные." }, { status: 409 });
  const data = { name: title.name, quantity, comment: b.comment?.trim() || null, photoName: b.photoName || null, closed: false, linkedProductId: null };
  const item = await prisma.productWish.upsert({ where, create: { customerId, nameKey: title.key, ...data }, update: data });
  return NextResponse.json({ id: item.id, notice: DEMAND_NOTICE });
}

export async function DELETE(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const id = demandId(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  await prisma.productWish.deleteMany({ where: { id, customerId } });
  return NextResponse.json({ removed: true });
}
