import { prisma } from "@/lib/prisma";

/** A verified phone may belong to several counterparties. Never choose the first one. */
export async function uniqueOneCCustomer(phone: string) {
  const rows = await prisma.oneCCustomer.findMany({ where: { OR: [{ phone }, { phones: { has: phone } }] }, take: 2 });
  return rows.length === 1 ? rows[0] : null;
}
