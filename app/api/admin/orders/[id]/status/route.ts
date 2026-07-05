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
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

// Valid transitions
const TRANSITIONS: Record<string, string[]> = {
  pending: ["assembly", "cancelled"],
  assembly: ["consultation", "payment", "cancelled"],
  consultation: ["assembly", "payment", "cancelled"],
  payment: ["exported", "cancelled"],
  exported: [],
  cancelled: [],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { status: toStatus } = body as { status: string };

  const order = await prisma.order.findUnique({ where: { id: Number(id) } });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const allowed = TRANSITIONS[order.status] || [];
  if (!allowed.includes(toStatus)) {
    return NextResponse.json(
      { error: `Нельзя перейти из "${order.status}" в "${toStatus}"` },
      { status: 400 }
    );
  }

  // If moving back to assembly — delete existing checks so picker re-checks
  if (toStatus === "assembly" && order.status === "consultation") {
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    await prisma.orderItemCheck.deleteMany({
      where: { orderItemId: { in: items.map((i) => i.id) } },
    });
  }

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: Number(id) },
      data: { status: toStatus },
    }),
    prisma.orderStatusLog.create({
      data: {
        orderId: Number(id),
        fromStatus: order.status,
        toStatus,
        userId: user.id,
      },
    }),
  ]);

  return NextResponse.json({ order: updatedOrder });
}
