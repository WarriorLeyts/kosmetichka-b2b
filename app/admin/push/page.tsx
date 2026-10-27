import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const AUDIENCE: Record<string, { label: string; types: string[] }> = {
  all: { label: "Все клиенты", types: ["retail", "discount", "wholesale", "big_wholesale"] },
  retail: { label: "Розница и скидка", types: ["retail", "discount"] },
  wholesale: { label: "Опт", types: ["wholesale"] },
  big_wholesale: { label: "Крупный опт", types: ["big_wholesale"] },
};

async function adminId(): Promise<number> {
  const token = (await cookies()).get("admin_token")?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload?.id || payload.role !== "admin") redirect("/admin");
  return Number(payload.id);
}

/** Sends a promo push to customers who agreed to «Акции и новости» in the app. */
async function send(formData: FormData) {
  "use server";
  const userId = await adminId();
  const title = String(formData.get("title") || "").trim().slice(0, 80);
  const body = String(formData.get("body") || "").trim().slice(0, 400);
  const audience = String(formData.get("audience") || "all");
  const article = String(formData.get("article") || "").trim();
  if (!title || !body || !AUDIENCE[audience]) redirect("/admin/push?error=empty");

  let link: string | null = null;
  if (article) {
    const p = await prisma.product.findFirst({ where: { OR: [{ article }, { barcode: article }] }, select: { id: true } });
    if (!p) redirect("/admin/push?error=article");
    link = `/product/${p.id}`;
  }

  const customers = await prisma.customer.findMany({
    where: { isActive: true, isApproved: true, pushPromo: true, priceType: { in: AUDIENCE[audience].types } },
    select: { id: true },
  });
  const r = await notify(customers.map((c) => c.id), { kind: "promo", title, body, link });
  await prisma.pushBroadcast.create({
    data: { title, body, audience, link, recipients: r.customers, devices: r.devices, userId },
  });
  redirect(`/admin/push?sent=${r.customers}&devices=${r.devices}`);
}

export default async function PushPage({ searchParams }: { searchParams: Promise<{ sent?: string; devices?: string; error?: string }> }) {
  await adminId();
  const sp = await searchParams;
  const [withApp, promo, history] = await Promise.all([
    prisma.pushToken.groupBy({ by: ["customerId"] }).then((r) => r.length),
    prisma.customer.count({ where: { isActive: true, pushPromo: true } }),
    prisma.pushBroadcast.findMany({ orderBy: { id: "desc" }, take: 30 }),
  ]);
  const fmt = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold">Рассылки в приложение</h1>
      <p className="mb-6 text-sm text-slate-500">
        Получат только клиенты, которые включили «Акции и новости» в приложении: сейчас {promo}. С установленным приложением и включёнными push: {withApp}.
        Уведомления о заказах, чате, бонусах и поступлениях приходят всем автоматически.
      </p>

      {sp.sent ? (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Отправлено: {sp.sent} клиентам (в «Уведомления»), push доставлено на {sp.devices} устройств.
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {sp.error === "article" ? "Товар с таким артикулом или штрихкодом не найден." : "Заполните заголовок и текст."}
        </div>
      ) : null}

      <form action={send} className="space-y-4 rounded-2xl border bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-bold">Заголовок</label>
          <input name="title" maxLength={80} required className="w-full rounded-xl border p-3" placeholder="Скидка 20% на парфюм" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold">Текст</label>
          <textarea name="body" maxLength={400} required rows={3} className="w-full rounded-xl border p-3" placeholder="Только до воскресенья — на все ароматы Creed" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold">Кому</label>
          <select name="audience" className="w-full rounded-xl border p-3" defaultValue="all">
            {Object.entries(AUDIENCE).map(([v, a]) => (
              <option key={v} value={v}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold">Открыть товар (необязательно)</label>
          <input name="article" className="w-full rounded-xl border p-3" placeholder="Артикул или штрихкод — по нажатию откроется этот товар" />
        </div>
        <button type="submit" className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-3 font-black text-white">
          Отправить
        </button>
      </form>

      <h2 className="mb-3 mt-8 text-lg font-bold">История</h2>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">Рассылок ещё не было.</p>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>{fmt(h.createdAt)} · {AUDIENCE[h.audience]?.label ?? h.audience}</span>
                <span>клиентов {h.recipients} · устройств {h.devices}</span>
              </div>
              <p className="mt-1 font-semibold">{h.title}</p>
              <p className="text-slate-600">{h.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
