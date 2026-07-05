import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  const secret = process.env.JWT_SECRET || "dev-fallback";
  return new TextEncoder().encode(secret);
}

async function getPickerUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager", "picker"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getPickerUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await request.json();
  const { orderId, items } = body as {
    orderId: number;
    items: Array<{
      itemId: number;
      status: string;
      availableQty?: number | null;
      note?: string | null;
    }>;
  };

  if (!orderId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  if (order.status !== "assembly") {
    return NextResponse.json(
      { error: "Заказ не находится на стадии сборки" },
      { status: 400 }
    );
  }

  // Upsert each item check
  for (const item of items) {
    await prisma.orderItemCheck.upsert({
      where: { orderItemId: item.itemId },
      update: {
        status: item.status,
        availableQty: item.availableQty ?? null,
        note: item.note ?? null,
        pickerId: user.id,
      },
      create: {
        orderItemId: item.itemId,
        status: item.status,
        availableQty: item.availableQty ?? null,
        note: item.note ?? null,
        pickerId: user.id,
      },
    });
  }

  const hasIssues = items.some((i) => i.status !== "ok");

  // Determine new status
  const newStatus = hasIssues ? "consultation" : "payment";

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    }),
    prisma.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: "assembly",
        toStatus: newStatus,
        userId: user.id,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    newStatus,
  });
}
