import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ONLY, requireStaff } from "../_auth";
import { broadcastStats, PUSH_AUDIENCE, sendBroadcast } from "@/lib/pushBroadcast";

// GET /api/team/push — «Рассылки»: who will receive, audiences, history (admin only, as on the site)
export async function GET() {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  const { withApp, promo, history } = await broadcastStats();
  return NextResponse.json({
    promo,
    withApp,
    audiences: Object.entries(PUSH_AUDIENCE).map(([value, a]) => ({ value, label: a.label })),
    history: history.map((h) => ({
      id: h.id,
      title: h.title,
      body: h.body,
      audience: h.audience,
      audienceLabel: PUSH_AUDIENCE[h.audience]?.label ?? h.audience,
      link: h.link,
      recipients: h.recipients,
      devices: h.devices,
      createdAt: h.createdAt.toISOString(),
    })),
  });
}

// POST /api/team/push { title, body, audience, article? } — sends a promo broadcast
export async function POST(request: NextRequest) {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  const b = (await request.json().catch(() => ({}))) as { title?: string; body?: string; audience?: string; article?: string };
  const r = await sendBroadcast({ title: b.title ?? "", body: b.body ?? "", audience: b.audience ?? "all", article: b.article ?? null }, Number(auth.session.id));
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error === "article" ? "Товар с таким артикулом или штрихкодом не найден" : "Заполните заголовок и текст" },
      { status: 400 }
    );
  }
  return NextResponse.json(r);
}
