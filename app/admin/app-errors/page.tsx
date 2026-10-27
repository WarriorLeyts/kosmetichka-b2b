import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const APP = { customer: "Косметичка", team: "Team" } as Record<string, string>;

/** Errors and crashes reported by the apps (last 30 days), most recent first. */
export default async function AppErrorsPage() {
  const since = new Date(Date.now() - 30 * 24 * 3600e3);
  const rows = await prisma.appError.findMany({
    where: { lastAt: { gte: since } },
    orderBy: { lastAt: "desc" },
    take: 200,
  });
  const fmt = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ошибки приложений</h1>
        <span className="text-sm text-slate-400">за 30 дней: {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-slate-500">Ошибок нет.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <details key={r.id} className="rounded-2xl border bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {r.fatal ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">Падение</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">Ошибка</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{APP[r.app] ?? r.app} · {r.platform === "ios" ? "iPhone" : r.platform === "android" ? "Android" : r.platform}</span>
                  <span className="text-slate-500">×{r.count} · клиентов: {r.customers.length} · последняя {fmt(r.lastAt)} · первая {fmt(r.firstAt)}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-800 break-words">{r.message}</p>
                {r.screen ? <p className="text-xs text-slate-500">Экран: {r.screen}{r.version ? ` · версия ${r.version}` : ""}</p> : null}
              </summary>
              {r.stack ? <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{r.stack}</pre> : null}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
