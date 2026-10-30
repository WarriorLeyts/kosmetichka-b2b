import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { RateLimiter } from "@/lib/rateLimit";
import { onLive } from "@/lib/realtime";

// one browser must not be able to load the server: the same list asked again within 2 s gets the
// last answer from memory (no database), and more than 120 lists a minute get «too often»
const g = globalThis as unknown as { __ordersListCache?: Map<string, { at: number; body: unknown }> };
const recent = (g.__ordersListCache ??= new Map());
const limiter = new RateLimiter({ windowMs: 60_000, max: 120 });
// an order of the customer changed → his lists are read from the database again
const gl = globalThis as unknown as { __ordersListCacheHooked?: boolean };
if (!gl.__ordersListCacheHooked) {
  gl.__ordersListCacheHooked = true;
  onLive((e) => {
    if (e.t !== "order" || !e.customerId) return;
    for (const k of recent.keys()) if (k.startsWith(`${e.customerId}|`)) recent.delete(k);
  });
}

const PAGE_SIZE = 20;

// GET /api/mobile/orders?page=&status=&dateFrom=&dateTo= — same data as the /orders page
export async function GET(request: Request) {
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const url = new URL(request.url);
  const cacheKey = `${customerId}|${url.search}`;
  const hit = recent.get(cacheKey);
  if (hit && Date.now() - hit.at < 2000) return NextResponse.json(hit.body);
  if (!limiter.check(`orders:${customerId}`).ok) {
    return NextResponse.json({ error: "Слишком часто — подождите немного" }, { status: 429, headers: { "Retry-After": "30" } });
  }

  const sp = url.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const statusFilter = sp.get("status") || "";
  const MSK = "+03:00";
  const dateFrom = sp.get("dateFrom") ? new Date(sp.get("dateFrom") + "T00:00:00" + MSK) : null;
  const dateTo = sp.get("dateTo") ? new Date(sp.get("dateTo") + "T23:59:59" + MSK) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { customerId };
  if (statusFilter) where.status = statusFilter;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  const [totalCount, orders, sumResult, topItems] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        status: true,
        total: true,
        promoCode: true,
        discount: true,
        bonusesApplied: true,
        bonusesCollected: true,
        comment: true,
        createdAt: true,
        customerConfirmed: true,
        confirmRequestedAt: true,
        changesSnapshot: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,
            productName: true,
            barcode: true,
            quantity: true,
            price: true,
            total: true,
            discount: true,
            bonusDiscount: true,
            variantImageUrl: true,
            variantName: true,
          },
        },
      },
    }),
    prisma.order.aggregate({ where: { customerId }, _sum: { total: true }, _count: { id: true } }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: { order: { customerId } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    }),
  ]);

  const needImage = [
    ...new Set(orders.flatMap((o) => o.items.filter((i) => !i.variantImageUrl).map((i) => i.productId))),
  ];
  const images = needImage.length
    ? await prisma.productImage.findMany({
        where: { productId: { in: needImage } },
        select: { productId: true, path: true },
        orderBy: { id: "asc" },
      })
    : [];
  const imageByProductId = new Map<number, string>();
  for (const img of images) if (!imageByProductId.has(img.productId)) imageByProductId.set(img.productId, img.path);

  const body = {
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    stats: {
      totalOrders: sumResult._count.id,
      totalSum: sumResult._sum.total ?? 0,
      topProduct: topItems[0]?.productName ?? null,
      topProductQty: topItems[0]?._sum.quantity ?? 0,
    },
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: o.total,
      promoCode: o.promoCode ?? null,
      discount: o.discount,
      bonusesApplied: o.bonusesApplied,
      bonusesCollected: o.bonusesCollected,
      comment: o.comment,
      createdAt: o.createdAt.toISOString(),
      customerConfirmed: o.customerConfirmed,
      /** the manager changed the order and waits for the customer's «Подтвердить» */
      needsConfirm: !!o.confirmRequestedAt || (o.status === "consultation" && !o.customerConfirmed),
      changesSnapshot: o.changesSnapshot ?? null,
      items: o.items.map((item) => ({
        ...item,
        barcode: item.barcode ?? null,
        variantImageUrl: item.variantImageUrl ?? null,
        variantName: item.variantName ?? null,
        imagePath: imageByProductId.get(item.productId) ?? null,
      })),
    })),
  };
  recent.set(cacheKey, { at: Date.now(), body });
  if (recent.size > 2000) recent.clear();
  return NextResponse.json(body);
}
