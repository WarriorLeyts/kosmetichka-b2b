import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ customer: null });
  }

  const payload = await verifyCustomerToken(token);

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
      // wholesale accounts without the shop's address give it at checkout
      address: true,
      wholesaleAccess: true,
      roleRequest: true,
      roleRequestStatus: true,
    },
  });

  return NextResponse.json({ customer });
}