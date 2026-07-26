import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// Prefix we put on customer messages when posting to Bitrix timeline.
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

/** Look up the Bitrix deal ID for an order: first by stored bitrixDealId, then by XML_ID search. */
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
  } catch {
    // Bitrix unavailable
  }
  return null;
}

type Props = { params: Promise<{ id: string }> };

// ── GET /api/orders/[id]/messages ──────────────────────────────────────────

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

  // ── Sync manager replies from Bitrix ─────────────────────────────────────
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (webhookUrl) {
    const dealId = await resolveBitrixDealId(orderId, order.bitrixDealId, webhookUrl);
    if (dealId) {
      try {
        const r = await bitrixPost(webhookUrl, "crm.timeline.comment.list", {
          filter: {
            ENTITY_TYPE: "deal",
            ENTITY_ID: String(dealId),
          },
        });
        const comments: any[] = r.result || [];

        for (const c of comments) {
          const text: string = String(c.COMMENT || "").trim();
          const commentId = String(c.ID);

          // Skip customer messages we posted ourselves
          if (
            text.startsWith(CUSTOMER_MARKER.trim()) ||
            text.startsWith(CUSTOMER_MARKER_BITRIX) ||
            text.startsWith("[🛒") ||
            text.startsWith("[:f09f9b92:")
          ) {
            continue;
          }
          if (!text) continue;

          // Save new manager message; bitrixCommentId unique constraint prevents duplicates
          try {
            await prisma.orderMessage.create({
              data: {
                orderId,
                text,
                isFromPicker: true, // "from manager" in customer chat (isFromPicker=true means "from the other side")
                source: "customer",
                bitrixCommentId: commentId,
              },
            });
          } catch {
            // Duplicate — already saved
          }
        }
      } catch (err) {
        console.error("[Chat] Ошибка timeline.comment.list:", err);
      }
    }
  }

  const messages = await prisma.orderMessage.findMany({
    where: { orderId, source: "customer" },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  // Map isFromPicker → isFromManager for backward compatibility with the customer UI
  const mapped = messages.map((m) => ({
    id: m.id,
    text: m.text,
    isFromManager: m.isFromPicker,
    createdAt: m.createdAt,
  }));

  return NextResponse.json({ messages: mapped });
}

// ── POST /api/orders/[id]/messages ────────────────────────────────────────

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

  // Save customer message (isFromPicker=false = from customer)
  const message = await prisma.orderMessage.create({
    data: { orderId, text, isFromPicker: false, source: "customer" },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  // Post to Bitrix timeline (fire & forget)
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
