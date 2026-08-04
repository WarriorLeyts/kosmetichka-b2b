import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;

  try {
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

  return NextResponse.json({ success: true });
}