import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function bitrixCall(webhookUrl: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function cancelDealInBitrix(orderId: number) {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    // Найти сделку по XML_ID = orderId (самую новую)
    const r = await bitrixCall(webhookUrl, "crm.deal.list", {
      filter: { XML_ID: String(orderId) },
      select: ["ID"],
      order: { DATE_CREATE: "DESC" },
    });
    let dealId: number | null = r.result?.[0]?.ID ? Number(r.result[0].ID) : null;

    // Запасной поиск по заголовку "Заказ №N" — берём самую новую сделку
    if (!dealId) {
      const r2 = await bitrixCall(webhookUrl, "crm.deal.list", {
        filter: { TITLE: `Заказ №${orderId}` },
        select: ["ID"],
        order: { DATE_CREATE: "DESC" },
      });
      if (r2.result?.length > 0) dealId = Number(r2.result[0].ID);
    }

    if (!dealId) {
      console.warn(`[Bitrix] Сделка для заказа №${orderId} не найдена`);
      return;
    }

    await bitrixCall(webhookUrl, "crm.deal.update", {
      id: dealId,
      fields: { STAGE_ID: "UC_TAPSI1" }, // Отменен
    });
    console.log(`[Bitrix] Сделка ${dealId} → Отменен (заказ №${orderId})`);
  } catch (err) {
    console.error("[Bitrix] Ошибка при отмене сделки:", err);
  }
}

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
  });

  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  // Once a manager has touched the order (approved/exported) it's already
  // on its way to 1С — the customer can only withdraw it while it's still
  // sitting in the confirmation queue.
  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "Заказ уже в обработке, отменить его можно только до подтверждения менеджером" },
      { status: 400 }
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "cancelled" },
  });

  // Перенести сделку в Битрикс в стадию "Отменен"
  cancelDealInBitrix(order.id).catch((err) =>
    console.error("[Bitrix] cancelDealInBitrix:", err)
  );

  return NextResponse.json({ success: true });
}
