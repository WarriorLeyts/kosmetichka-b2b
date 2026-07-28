import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

const STATUS_LABELS: Record<string, string> = {
  assembly: "Сборка",
  consultation: "Консультация",
  payment: "К оплате",
  exported: "Выгружен",
  cancelled: "Отменён",
};

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
  approved: ["assembly", "payment", "cancelled"], // legacy status
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

  // Уведомление покупателю о смене статуса
  const notifyStatuses = ["payment", "cancelled", "assembly"];
  if (notifyStatuses.includes(toStatus)) {
    const fullOrder = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { customer: { select: { email: true, name: true, companyName: true } } },
    });
    const email = fullOrder?.customer?.email;
    if (email) {
      const label = STATUS_LABELS[toStatus] ?? toStatus;
      const clientName = fullOrder.customer.companyName || fullOrder.customer.name || "Клиент";
      const statusColor = toStatus === "cancelled" ? "#ef4444" : toStatus === "payment" ? "#10b981" : "#6366f1";
      sendMail({
        to: email,
        subject: `Заказ #${id} — статус изменён на «${label}»`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">Статус вашего заказа изменился</h2>
            <p style="margin:0 0 8px;color:#475569;">Здравствуйте, ${clientName}!</p>
            <p style="margin:0 0 24px;color:#475569;">
              Статус заказа <b>#${id}</b> изменён на
              <span style="font-weight:700;color:${statusColor};">${label}</span>.
            </p>
            <a href="https://kosmetichka-opt.ru/orders/${id}"
               style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;">
              Открыть заказ
            </a>
          </div>
        `,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ order: updatedOrder });
}
