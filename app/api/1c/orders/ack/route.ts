import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAXMA_ORDER_WHERE, onOrderStatus } from "@/lib/maxmaOrders";

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return key === process.env.SYNC_API_KEY;
}

// POST /api/1c/orders/ack
// Body: { ids: [1, 2, 3] }
// Marks orders as exported to 1C so they won't be re-exported
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const raw = body.ids ?? [];
  const ids: number[] = (Array.isArray(raw) ? raw : [raw]).map(Number).filter(Boolean);

  if (!ids.length) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  // Orders this ack actually moves to "exported" (for the MAXMA confirm below)
  const toConfirm = await prisma.order.findMany({
    where: { id: { in: ids }, oneCExportedAt: null, ...MAXMA_ORDER_WHERE },
    select: { id: true },
  });

  const result = await prisma.order.updateMany({
    where: {
      id: { in: ids },
      oneCExportedAt: null,
    },
    data: {
      status: "exported",
      oneCExportedAt: new Date(),
    },
  });

  // MAXMA: confirm via the queue (tasks saved now, calls in the background)
  if (toConfirm.length) await onOrderStatus(toConfirm.map((o) => o.id), "exported", { background: true });

  return NextResponse.json({ ok: true, marked: result.count });
}
