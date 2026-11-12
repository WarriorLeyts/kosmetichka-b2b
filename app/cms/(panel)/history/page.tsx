import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCmsPage } from "@/lib/cms/page";

export const metadata = { title: "Журнал действий" };

const ENTITY_LINK: Record<string, (id: string) => string> = { product: (id) => `/products/${id}`, banner: () => "/banners", page: () => "/home" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; entity?: string }> }) {
  await requireCmsPage("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.entity ? { entity: sp.entity } : {};
  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    prisma.adminAuditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 50));
  const q = (p: number) => `?${new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), page: String(p) })}`;
  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight">Журнал действий</h1>
      <p className="mb-4 text-sm text-neutral-500">Кто, что и когда менял в админ-панели. Записи не удаляются.</p>
      <div className="mb-3 flex gap-2 text-sm">
        {[
          ["", "Все"],
          ["product", "Товары"],
          ["banner", "Баннеры"],
          ["page", "Главная"],
        ].map(([k, label]) => (
          <Link key={k} href={k ? `?entity=${k}` : "?"} className={`rounded-lg px-3 py-1.5 ${(sp.entity ?? "") === k ? "bg-[#FBEFF3] text-[#8E1B47]" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
            <tr>
              <th className="px-3 py-2">Когда</th>
              <th className="px-3 py-2">Сотрудник</th>
              <th className="px-3 py-2">Действие</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => {
              const href = r.entityId && ENTITY_LINK[r.entity] ? ENTITY_LINK[r.entity](r.entityId) : r.entity === "banner" || r.entity === "page" ? ENTITY_LINK[r.entity]("") : null;
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                    {r.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{r.userName}</td>
                  <td className="px-3 py-2">
                    {href ? (
                      <Link href={href} className="hover:text-[#8E1B47]">
                        {r.summary}
                      </Link>
                    ) : (
                      r.summary
                    )}
                    {r.before || r.after ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-neutral-500">было / стало</summary>
                        <div className="mt-1 grid gap-2 md:grid-cols-2">
                          <pre className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px]">{r.before ? JSON.stringify(r.before, null, 1) : "—"}</pre>
                          <pre className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px]">{r.after ? JSON.stringify(r.after, null, 1) : "—"}</pre>
                        </div>
                      </details>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-400">{r.ip}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-neutral-500">
                  Записей пока нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
        <span>
          Всего: {total} · страница {page} из {pages}
        </span>
        <span className="flex gap-3">
          {page > 1 ? <Link href={q(page - 1)}>← Назад</Link> : null}
          {page < pages ? <Link href={q(page + 1)}>Дальше →</Link> : null}
        </span>
      </div>
    </div>
  );
}
