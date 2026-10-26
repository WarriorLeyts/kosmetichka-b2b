import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { maxmaConfigured } from "@/lib/maxma";
import { maxmaStuckByOrder, resetMaxmaTasks, runMaxmaQueue, runOrderMaxmaTasks } from "@/lib/maxmaQueue";

// POST /api/admin/maxma/retry { orderId?: number } — runs the MAXMA queue now: the order's
// pending / failed tasks (or all of them without orderId), ignoring their backoff.
// 200 { ok, ran, done, failed, skipped, stuck: { action, attempts, lastError, status, createdAt } | null }
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!maxmaConfigured()) return NextResponse.json({ error: "MAXMA не настроена (MAXMA_API_KEY)" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const raw = (body as { orderId?: unknown })?.orderId;
  const orderId = raw == null || raw === "" ? undefined : Number(raw);
  if (orderId !== undefined && (!Number.isInteger(orderId) || orderId <= 0)) {
    return NextResponse.json({ error: "Некорректный orderId" }, { status: 400 });
  }

  await resetMaxmaTasks(orderId);
  const stats = orderId ? await runOrderMaxmaTasks(orderId, 20) : await runMaxmaQueue(100);
  const stuck = orderId ? ((await maxmaStuckByOrder([orderId])).get(orderId) ?? null) : null;
  return NextResponse.json({ ok: stats.failed === 0, ran: stats.ran, done: stats.ok, failed: stats.failed, skipped: stats.skipped, stuck });
}
