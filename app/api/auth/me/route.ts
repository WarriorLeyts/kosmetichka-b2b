import { cardGivesDiscount } from "@/lib/discountCard";
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
      showRetailPrice: true,
      roleRequest: true,
      roleRequestStatus: true,
      loyaltyCard: true,
      maxmaDiscount: true,
    },
  });
  if (!customer) return NextResponse.json({ customer: null });
  // hasCard: the card gives the discount price (lib/discountCard.ts); cardLinked: any card is linked
  const { loyaltyCard, maxmaDiscount, ...rest } = customer;
  return NextResponse.json({ customer: { ...rest, hasCard: cardGivesDiscount({ loyaltyCard, maxmaDiscount }), cardLinked: Boolean(loyaltyCard?.trim()) } });
}