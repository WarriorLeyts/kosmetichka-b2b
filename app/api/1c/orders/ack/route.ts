import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const result = await prisma.order.updateMany({
    where: {
      id: { in: ids },
      oneCExportedAt: null,
    },
    data: {
      oneCExportedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, marked: result.count });
}
