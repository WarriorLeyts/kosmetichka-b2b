import { NextRequest, NextResponse } from "next/server";
import { syncKeyOk } from "@/lib/syncKey";
import { markExported } from "@/lib/onecOrders";

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return syncKeyOk(key);
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

  // Same per-order lock and paused/cancelled protection as the OData exporter.
  const marked = await markExported(ids);
  return NextResponse.json({ ok: true, marked });
}
