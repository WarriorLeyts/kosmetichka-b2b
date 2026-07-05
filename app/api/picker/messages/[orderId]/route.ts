import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  const secret = process.env.JWT_SECRET || "dev-fallback";
  return new TextEncoder().encode(secret);
}

async function getUser() {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { orderId } = await params;

  const messages = await prisma.orderMessage.findMany({
    where: { orderId: Number(orderId) },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { orderId } = await params;
  const body = await request.json();
  const { text } = body as { text: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }

  const message = await prisma.orderMessage.create({
    data: {
      orderId: Number(orderId),
      userId: user.id,
      text: text.trim(),
      isFromPicker: user.role === "picker",
    },
    include: { user: { select: { name: true, role: true } } },
  });

  return NextResponse.json({ message });
}
