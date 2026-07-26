import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

async function bitrixPost(webhookUrl: string, method: string, params: Record<string, unknown>) {
  const url = `${webhookUrl}/${method}.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Bitrix HTTP ${res.status}`);
  return res.json();
}

async function resolveBitrixDealId(orderId: number): Promise<number | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { bitrixDealId: true },
  });
  return order?.bitrixDealId ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  // Sync from Bitrix if configured
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const dealId = await resolveBitrixDealId(orderId);
      if (dealId) {
        const result = await bitrixPost(webhookUrl, "crm.timeline.comment.list", {
          filter: { ENTITY_TYPE: "deal", ENTITY_ID: dealId },
          order: { ID: "ASC" },
        });
        const comments: Array<{ ID: string; COMMENT: string }> = result?.result ?? [];
        for (const comment of comments) {
          const text = comment.COMMENT ?? "";
          // Skip system/emoji prefixed messages
          if (text.startsWith("[🛒") || text.startsWith("[:f09f9b92:]")) continue;

          const existing = await prisma.orderMessage.findUnique({
            where: { bitrixCommentId: String(comment.ID) },
          });
          if (!existing) {
            await prisma.orderMessage.create({
              data: {
                orderId,
                text,
                isFromPicker: true,
                source: "customer",
                bitrixCommentId: String(comment.ID),
              },
            });
          }
        }
      }
    } catch (err) {
      console.error("Bitrix sync error:", err);
    }
  }

  const messages = await prisma.orderMessage.findMany({
    where: { orderId, source: "customer" },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = await req.json();
  const text: string = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const message = await prisma.orderMessage.create({
    data: {
      orderId,
      userId: user.id,
      text,
      isFromPicker: true,
      source: "customer",
    },
    select: { id: true, text: true, isFromPicker: true, createdAt: true },
  });

  // Post to Bitrix if configured
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const dealId = await resolveBitrixDealId(orderId);
      if (dealId) {
        const result = await bitrixPost(webhookUrl, "crm.timeline.comment.add", {
          fields: {
            ENTITY_TYPE: "deal",
            ENTITY_ID: dealId,
            COMMENT: text,
          },
        });
        const bitrixCommentId = result?.result ? String(result.result) : null;
        if (bitrixCommentId) {
          await prisma.orderMessage.update({
            where: { id: message.id },
            data: { bitrixCommentId },
          });
        }
      }
    } catch (err) {
      console.error("Bitrix post error:", err);
    }
  }

  return NextResponse.json({
    message: {
      id: message.id,
      text: message.text,
      isFromPicker: message.isFromPicker,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
