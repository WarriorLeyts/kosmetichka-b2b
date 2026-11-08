import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderScopeWhere, staffScope } from "@/lib/staffScope";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const mine = orderScopeWhere(await staffScope(user));
  const [pending, consultation] = await Promise.all([
    prisma.order.count({ where: { ...mine, status: "pending" } }),
    prisma.order.count({ where: { ...mine, status: "consultation" } }),
  ]);

  return NextResponse.json({ pending, consultation, total: pending + consultation });
}
