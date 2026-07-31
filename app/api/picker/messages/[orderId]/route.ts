import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getStaffUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const role = payload.role as string;
  if (!["admin", "manager", "picker"].includes(role)) return null;
  return { id: payload.id as number, role };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { orderId } = await params;

  const msgs = await prisma.orderMessage.findMany({
    where: { orderId: Number(orderId), source: "picker" },
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
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { orderId } = await params;

  const { text } = await request.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const isFromPicker = user.role === "picker";

  const msg = await prisma.orderMessage.create({
    data: {
      orderId: Number(orderId),
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
