import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAdminRole } from "@/lib/auth";
import { SMS_TEXT, smsCustomer } from "@/lib/sms";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  // managers only view customers: approving and editing is for the admin
  if (!(await requireAdminRole())) return NextResponse.json({ error: "Только администратор может подтверждать и изменять клиентов" }, { status: 403 });

  const { id } = await params;

  let wasApproved = true;
  try {
    const before = await prisma.customer.findUnique({ where: { id: Number(id) }, select: { isApproved: true } });
    wasApproved = !!before?.isApproved;
    await prisma.customer.update({
      where: {
        id: Number(id),
      },
      data: {
        isApproved: true,
      },
    });
  } catch (err) {
    console.error("[approve] prisma.customer.update error:", err);
    return NextResponse.json({ error: "Не удалось одобрить клиента" }, { status: 500 });
  }

  // an SMS to the customer's phone — only when the registration is confirmed now, not again
  if (!wasApproved) void smsCustomer(Number(id), SMS_TEXT.registrationApproved);

  return NextResponse.json({ success: true });
}