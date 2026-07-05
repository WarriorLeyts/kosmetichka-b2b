import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const CUSTOMER_MARKER = "[🛒 Сообщение покупателя]\n";
const CUSTOMER_MARKER_BITRIX = "[:f09f9b92: Сообщение покупателя]";

async function bitrixPost(webhookUrl: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function resolveBitrixDealId(
  orderId: number,
  storedDealId: number | null,
  webhookUrl: string
): Promise<number | null> {
  if (storedDealId) return storedDealId;
  try {
    const r = await bitrixPost(webhookUrl, "crm.deal.list", {
      filter: { XML_ID: String(orderId) },
      select: ["ID"],
      order: { DATE_CREATE: "DESC" },
    });
    if (r.result?.length > 0) {
      const dealId = Number(r.result[0].ID);
      await prisma.order.update({ where: { id: orderId }, data: { bitrixDealId: dealId } });
      return dealId;
    }
  } catch {}
  return null;
}

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (webhookUrl) {
    const dealId = await resolveBitrixDealId(orderId, order.bitrixDealId, webhookUrl);
    if (dealId) {
      try {
        const r = await bitrixPost(webhookUrl, "crm.timeline.comment.list", {
          filter: { ENTITY_TYPE: "deal", ENTITY_ID: String(dealId) },
        });
        const comments: any[] = r.result || [];
        for (const c of comments) {
          const text: string = String(c.COMMENT || "").trim();
          if (
            text.startsWith(CUSTOMER_MARKER.trim()) ||
            text.startsWith(CUSTOMER_MARKER_BITRIX) ||
            text.startsWith("[🛒") ||
            text.startsWith("[:f09f9b92:")
          ) continue;
          if (!text) continue;
          // isFromPicker=true used here to mean "from manager" (customer chat context)
          const existing = await prisma.orderMessage.findFirst({
            where: { orderId, text, isFromPicker: true },
          });
          if (!existing) {
            await prisma.orderMessage.create({
              data: { orderId, text, isFromPicker: true },
            });
          }
        }
      } catch (err) {
        console.error("[Chat] Ошибка timeline.comment.list:", err);
      }
    }
  }

  const messages = await prisma.orderMessage.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      isFromManager: m.isFromPicker,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(request: NextRequest, { params }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const text: string = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Сообщение пустое" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });

  const message = await prisma.orderMessage.create({
    data: { orderId, text, isFromPicker: false },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (webhookUrl) {
    resolveBitrixDealId(orderId, order.bitrixDealId, webhookUrl)
      .then(async (dealId) => {
        if (!dealId) return;
        await bitrixPost(webhookUrl, "crm.timeline.comment.add", {
          fields: {
            ENTITY_TYPE_ID: 2,
            ENTITY_ID: dealId,
            COMMENT: `${CUSTOMER_MARKER}${text}`,
          },
        });
      })
      .catch((err) => console.error("[Chat] Ошибка отправки в Битрикс:", err));
  }

  return NextResponse.json({
    message: {
      id: message.id,
      text: message.text,
      isFromManager: message.isFromPicker,
      createdAt: message.createdAt,
    },
  });
}
