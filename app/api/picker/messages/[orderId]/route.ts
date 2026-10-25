import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { denyIfNotAllowed, getPickerUser, parseId, type PickerUser } from "../../_access";

/** Validates the order id and the caller's access to the order. */
async function checkOrder(
  user: PickerUser,
  rawId: string
): Promise<{ orderId: number } | { response: NextResponse }> {
  const orderId = parseId(rawId);
  if (!orderId) {
    return { response: NextResponse.json({ error: "Неверный ID" }, { status: 400 }) };
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { pickerId: true },
  });
  if (!order) {
    return { response: NextResponse.json({ error: "Заказ не найден" }, { status: 404 }) };
  }
  const denied = denyIfNotAllowed(user, order);
  if (denied) return { response: denied };
  return { orderId };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getPickerUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const checked = await checkOrder(user, (await params).orderId);
  if ("response" in checked) return checked.response;
  const { orderId } = checked;

  const msgs = await prisma.orderMessage.findMany({
    where: { orderId, source: "picker" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({
    messages: msgs.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      userName: m.user?.name ?? null,
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getPickerUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const checked = await checkOrder(user, (await params).orderId);
  if ("response" in checked) return checked.response;
  const { orderId } = checked;

  const { text } = (await request.json().catch(() => null)) ?? {};
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const isFromPicker = user.role === "picker";

  const msg = await prisma.orderMessage.create({
    data: {
      orderId,
      text: text.trim(),
      source: "picker",
      isFromPicker,
      userId: user.id,
    },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      text: msg.text,
      isFromPicker: msg.isFromPicker,
      userName: msg.user?.name ?? null,
      userId: msg.userId,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
