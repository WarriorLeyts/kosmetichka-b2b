import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ customer: null });
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json({ customer: null });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: Number(payload.id) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      priceType: true,
    },
  });

  return NextResponse.json({ customer });
}