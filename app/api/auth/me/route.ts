import { cardGivesDiscount, cardKind } from "@/lib/discountCard";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { needsRenewal, renewSession } from "@/lib/sessionRenew";
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
      maxmaRetail: true,
    },
  });
  if (!customer) return NextResponse.json({ customer: null });
  // an active customer stays signed in (lib/sessionRenew.ts)
  if (needsRenewal(payload.iat)) await renewSession("auth_token", { id: customer.id, email: customer.email ?? customer.phone ?? String(customer.id), role: "customer" });
  // hasCard: the card gives the discount price (lib/discountCard.ts); cardLinked: any card is linked
  const { loyaltyCard, maxmaDiscount, maxmaRetail, ...rest } = customer;
  return NextResponse.json({ customer: { ...rest, hasCard: cardGivesDiscount({ loyaltyCard, maxmaDiscount, maxmaRetail }), cardType: cardKind({ loyaltyCard, maxmaDiscount, maxmaRetail }), cardLinked: Boolean(loyaltyCard?.trim()) } });
}