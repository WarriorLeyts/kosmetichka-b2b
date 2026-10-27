import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

/** Who gets a promo broadcast (by price type); only customers who agreed to «Акции и новости». */
export const PUSH_AUDIENCE: Record<string, { label: string; types: string[] }> = {
  all: { label: "Все клиенты", types: ["retail", "discount", "wholesale", "big_wholesale"] },
  retail: { label: "Розница и скидка", types: ["retail", "discount"] },
  wholesale: { label: "Опт", types: ["wholesale"] },
  big_wholesale: { label: "Крупный опт", types: ["big_wholesale"] },
};

export type BroadcastInput = { title: string; body: string; audience: string; article?: string | null };
export type BroadcastResult = { ok: true; recipients: number; devices: number } | { ok: false; error: "empty" | "article" };

/** Sends a promo broadcast (feed + push) and records it in the history. Used by the admin site and the Team app. */
export async function sendBroadcast(input: BroadcastInput, userId: number): Promise<BroadcastResult> {
  const title = String(input.title || "").trim().slice(0, 80);
  const body = String(input.body || "").trim().slice(0, 400);
  const audience = String(input.audience || "all");
  const article = String(input.article || "").trim();
  if (!title || !body || !PUSH_AUDIENCE[audience]) return { ok: false, error: "empty" };

  let link: string | null = null;
  if (article) {
    const p = await prisma.product.findFirst({ where: { OR: [{ article }, { barcode: article }] }, select: { id: true } });
    if (!p) return { ok: false, error: "article" };
    link = `/product/${p.id}`;
  }

  const customers = await prisma.customer.findMany({
    where: { isActive: true, isApproved: true, pushPromo: true, priceType: { in: PUSH_AUDIENCE[audience].types } },
    select: { id: true },
  });
  const r = await notify(customers.map((c) => c.id), { kind: "promo", title, body, link });
  await prisma.pushBroadcast.create({ data: { title, body, audience, link, recipients: r.customers, devices: r.devices, userId } });
  return { ok: true, recipients: r.customers, devices: r.devices };
}

/** Numbers shown above the form: who agreed to promo, who has the app with push. */
export async function broadcastStats() {
  const [withApp, promo, history] = await Promise.all([
    prisma.pushToken.groupBy({ by: ["customerId"] }).then((r) => r.length),
    prisma.customer.count({ where: { isActive: true, pushPromo: true } }),
    prisma.pushBroadcast.findMany({ orderBy: { id: "desc" }, take: 30 }),
  ]);
  return { withApp, promo, history };
}
