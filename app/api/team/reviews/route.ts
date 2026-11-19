import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderScopeWhere, staffScope } from "@/lib/staffScope";
import { ADMIN_MANAGER, requireStaff } from "../_auth";
import { parsePage } from "../_shared";

export async function GET(request: Request) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  const rating = sp.get("rating");
  if (rating && !/^[1-5]$/.test(rating)) return NextResponse.json({ error: "Неверная оценка" }, { status: 400 });
  const page = Math.min(parsePage(sp.get("page")), 100000);
  const where = { order: orderScopeWhere(await staffScope(auth.session)), ...(rating ? { rating: Number(rating) } : {}) };
  const [total, items] = await Promise.all([
    prisma.orderReview.count({ where }),
    prisma.orderReview.findMany({ where, orderBy: [{ createdAt: "desc" }, { orderId: "desc" }], skip: (page - 1) * 30, take: 30,
      select: { orderId: true, rating: true, comment: true, createdAt: true, order: { select: { customer: { select: { name: true, companyName: true } } } } } }),
  ]);
  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / 30) });
}
