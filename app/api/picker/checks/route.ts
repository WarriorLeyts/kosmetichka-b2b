import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getPickerUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;
  const role = payload.role as string;
  if (!["admin", "manager", "picker"].includes(role)) return null;
  return { id: payload.id as number, role };
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
      statuses?: string[];                              // plain string[] for hasIssues
      statusData?: Array<string | { s: string; q: number }>; // rich format with qty
      status?: string;                                  // legacy compat
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

  // SEC-3: validate that every submitted itemId belongs to this order
  const orderItemIds = new Set(order.items.map((i) => i.id));
  for (const item of items) {
    if (!orderItemIds.has(item.itemId)) {
      return NextResponse.json(
        { error: "Позиция не принадлежит этому заказу" },
        { status: 403 }
      );
    }
  }

  // Upsert each item check
  for (const item of items) {
    // Определяем значение для хранения в БД
    let statusValue: string;
    if (item.statusData !== undefined) {
      // Новый формат с количествами: [{s:"expired",q:2}, "bad_condition", ...]
      const data = item.statusData;
      if (data.length === 1 && data[0] === "ok") {
        statusValue = "ok";
      } else {
        statusValue = JSON.stringify(data);
      }
    } else {
      // Старый формат: массив строк или одна строка
      const statuses = item.statuses ?? (item.status ? [item.status] : ["ok"]);
      statusValue = statuses.length === 1 ? statuses[0] : JSON.stringify(statuses);
    }

    await prisma.orderItemCheck.upsert({
      where: { orderItemId: item.itemId },
      update: {
        status: statusValue,
        availableQty: item.availableQty ?? null,
        note: item.note ?? null,
        pickerId: user.id,
      },
      create: {
        orderItemId: item.itemId,
        status: statusValue,
        availableQty: item.availableQty ?? null,
        note: item.note ?? null,
        pickerId: user.id,
      },
    });
  }

  // ── Partial-check guard ────────────────────────────────────────────────────
  // Only close the assembly phase when EVERY order item has a check record.
  // A picker who submits a batch that covers fewer items than the order total
  // should get a partial-success response without a status transition.
  const [totalItems, totalChecks] = await Promise.all([
    prisma.orderItem.count({ where: { orderId } }),
    prisma.orderItemCheck.count({ where: { orderItem: { orderId } } }),
  ]);

  if (totalChecks < totalItems) {
    return NextResponse.json({
      success: true,
      partial: true,
      checked: totalChecks,
      total: totalItems,
      message: `Проверено ${totalChecks} из ${totalItems} позиций — сборка продолжается`,
    });
  }

  // Issues → consultation; all OK → payment
  // Читаем ВСЕ проверки из БД (а не только поданные в этом запросе)
  const allChecks = await prisma.orderItemCheck.findMany({
    where: { orderItem: { orderId } },
    select: { status: true },
  });

  const hasIssues = allChecks.some((c) => {
    // status is either "ok", a JSON array, or an issue string
    if (c.status === "ok") return false;
    try {
      const parsed = JSON.parse(c.status);
      if (Array.isArray(parsed)) {
        return !(parsed.length === 1 && parsed[0] === "ok");
      }
    } catch {
      // not JSON — treat as issue string
    }
    return true;
  });

  const newStatus = hasIssues ? "consultation" : "payment";

  await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  });

  // Log the status change
  await prisma.orderStatusLog.create({
    data: {
      orderId,
      fromStatus: "assembly",
      toStatus: newStatus,
      userId: user.id,
    },
  });

  return NextResponse.json({
    success: true,
    partial: false,
    checked: totalChecks,
    total: totalItems,
    newStatus,
  });
}
