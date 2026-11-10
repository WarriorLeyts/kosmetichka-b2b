import { prisma } from "@/lib/prisma";

/**
 * Under a product (owner's choice «Б», 2026-11-10): one strip with two tabs.
 *  - «С этим берут» (together): what customers bought in the same order with it, most orders first;
 *    while the history is thin — topped up with the same brand's products from other categories.
 *  - «Похожие» (similar): the same category, the same brand first, then the closest price.
 * Only products in stock for this customer (wholesalers: Product.wholesaleStock).
 */
export type RelatedKind = "together" | "similar";
export const RELATED_LIMIT = 12;

type P = { id: number; brandGuid: string | null; categoryGuid: string | null; prices: { priceType: string; price: number }[] };

const inStock = (wholesale: boolean) => (wholesale ? { wholesaleStock: { gt: 0 } } : { stock: { gt: 0 } });
const retail = (p: P) => p.prices.find((x) => x.priceType === "retail")?.price ?? p.prices[0]?.price ?? 0;

export async function relatedIds(productId: number, kind: RelatedKind, wholesale: boolean): Promise<number[]> {
  const self = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, brandGuid: true, categoryGuid: true, prices: { select: { priceType: true, price: true } } } });
  if (!self) return [];
  const out: number[] = [];
  const add = (ids: number[]) => {
    for (const id of ids) if (id !== productId && !out.includes(id) && out.length < RELATED_LIMIT) out.push(id);
  };

  if (kind === "together") {
    const rows = await prisma.$queryRaw<{ productId: number; n: number }[]>`
      SELECT b."productId" AS "productId", COUNT(DISTINCT b."orderId")::int AS n
      FROM "OrderItem" a JOIN "OrderItem" b ON b."orderId" = a."orderId" AND b."productId" <> a."productId"
      JOIN "Order" o ON o.id = a."orderId" AND o.status <> 'cancelled'
      WHERE a."productId" = ${productId}
      GROUP BY b."productId" ORDER BY n DESC LIMIT 60`;
    if (rows.length) {
      const ok = new Set((await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) }, ...inStock(wholesale) }, select: { id: true } })).map((p) => p.id));
      add(rows.map((r) => r.productId).filter((id) => ok.has(id)));
    }
    if (out.length < RELATED_LIMIT && self.brandGuid) {
      const more = await prisma.product.findMany({
        where: { brandGuid: self.brandGuid, id: { notIn: [productId, ...out] }, ...(self.categoryGuid ? { NOT: { categoryGuid: self.categoryGuid } } : {}), ...inStock(wholesale) },
        orderBy: [{ salesCount: "desc" }, { updatedAt: "desc" }],
        take: RELATED_LIMIT,
        select: { id: true },
      });
      add(more.map((p) => p.id));
    }
    return out;
  }

  if (!self.categoryGuid) return [];
  const cands = await prisma.product.findMany({
    where: { categoryGuid: self.categoryGuid, id: { not: productId }, ...inStock(wholesale) },
    orderBy: [{ salesCount: "desc" }],
    take: 300,
    select: { id: true, brandGuid: true, categoryGuid: true, prices: { select: { priceType: true, price: true } } },
  });
  const price = retail(self);
  cands.sort((a, b) => {
    const sa = a.brandGuid && a.brandGuid === self.brandGuid ? 0 : 1;
    const sb = b.brandGuid && b.brandGuid === self.brandGuid ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return Math.abs(retail(a) - price) - Math.abs(retail(b) - price);
  });
  add(cands.map((p) => p.id));
  return out;
}
