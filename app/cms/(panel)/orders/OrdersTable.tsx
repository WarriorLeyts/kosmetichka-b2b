"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";
import { Btn, Card, Input, PageHeader, Select } from "@/components/cms/ui";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { SYNC_LABELS, type SyncState } from "@/lib/cms/orderSync";
import { rub, StatusBadge, SyncBadge } from "./sync";

type Row = {
  id: number;
  status: string;
  total: number;
  createdAt: string;
  lines: number;
  customer: { id: number; name: string; phone: string | null } | null;
  sync: SyncState;
  oneCNumber: string | null;
  error: string | null;
  nextTryAt: string | null;
  lastTryAt: string | null;
  attempts: number;
};
type Data = { items: Row[]; total: number; page: number; limit: number; unsynced: number };

type Key = "search" | "status" | "sync" | "from" | "to" | "sort" | "dir" | "page" | "limit";
const FILTERS: Key[] = ["search", "status", "sync", "from", "to"];
const SYNC_FILTERS: [string, string][] = [
  ["unsynced", "Не передано в 1С"],
  ["failed", SYNC_LABELS.failed],
  ["pending", SYNC_LABELS.pending],
  ["sending", SYNC_LABELS.sending],
  ["synced", SYNC_LABELS.synced],
  ["waiting", "Ещё не оформлен менеджером"],
];

/** «12.11 15:45» — в таблице без года, чтобы колонки помещались */
const short = (d: string | null) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "") : "—";

export function OrdersTable({ canRetry }: { canRetry: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: Key) => sp.get(k) ?? "";
  const [search, setSearch] = useState(get("search"));
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const setParam = useCallback(
    (patch: Partial<Record<Key, string>>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      router.replace("?" + next.toString(), { scroll: false });
    },
    [router, sp]
  );

  const qs = sp.toString();
  const load = useCallback(async () => {
    try {
      setData(await cmsApi<Data>(`/api/cms/orders?${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }, [qs]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    // статусы обмена меняются сами (повторы по расписанию) — обновляем раз в 30 секунд
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => search !== get("search") && setParam({ search }), 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = async (id: number) => {
    setBusy((s) => new Set(s).add(id));
    try {
      const r = await cmsApi<{ sync: SyncState; error: string | null; oneCNumber: string | null }>(`/api/cms/orders/${id}/retry`, { method: "POST" });
      if (r.sync === "synced") toast.success(`Заказ №${id} передан в 1С${r.oneCNumber ? `: ${r.oneCNumber}` : ""}`);
      else toast.error(`Заказ №${id} не передан: ${r.error ?? SYNC_LABELS[r.sync]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      load();
    }
  };

  const sortBy = (k: string) => setParam({ sort: k, dir: get("sort") === k && get("dir") !== "asc" ? "asc" : "desc" });
  const sortIcon = (k: string) =>
    get("sort") === k || (!get("sort") && k === "date") ? get("dir") === "asc" ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" /> : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const page = data?.page ?? 1;
  const anyFilter = FILTERS.some((k) => sp.get(k));

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        title="Заказы"
        subtitle="Заказ уходит в 1С, когда менеджер переводит его в «Заказ оформлен». Если 1С не ответила или не хватает данных, сайт сам повторяет отправку — дубль в 1С не создаётся."
        actions={
          <Btn variant="outline" onClick={load}>
            <RefreshCw className="size-4" /> Обновить
          </Btn>
        }
      />

      {data && data.unsynced > 0 && get("sync") !== "unsynced" ? (
        <button
          onClick={() => setParam({ sync: "unsynced" })}
          className="mb-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-900 hover:border-amber-300"
        >
          Не передано в 1С: <b>{data.unsynced}</b> — показать
        </button>
      ) : null}

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-64 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: № заказа, № документа 1С, покупатель, телефон" />
          <Select className="w-auto" value={get("sync")} onChange={(e) => setParam({ sync: e.target.value })}>
            <option value="">Обмен с 1С: все</option>
            {SYNC_FILTERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={get("status")} onChange={(e) => setParam({ status: e.target.value })}>
            <option value="">Все статусы</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Input type="date" className="w-auto" value={get("from")} onChange={(e) => setParam({ from: e.target.value })} aria-label="С даты" />
          <Input type="date" className="w-auto" value={get("to")} onChange={(e) => setParam({ to: e.target.value })} aria-label="По дату" />
          {anyFilter ? (
            <Btn
              variant="ghost"
              onClick={() => {
                setSearch("");
                router.replace("?", { scroll: false });
              }}
            >
              Сбросить
            </Btn>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
            <tr>
              <th className="cursor-pointer px-3 py-2" onClick={() => sortBy("id")}>
                Заказ {sortIcon("id")}
              </th>
              <th className="px-2 py-2">Покупатель</th>
              <th className="cursor-pointer px-2 py-2 text-right" onClick={() => sortBy("total")}>
                Сумма {sortIcon("total")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("date")}>
                Дата {sortIcon("date")}
              </th>
              <th className="px-2 py-2">Статус заказа</th>
              <th className="px-2 py-2">Обмен с 1С</th>
              <th className="px-2 py-2">Документ 1С</th>
              <th className="px-2 py-2">Ошибка</th>
              <th className="px-2 py-2">Последняя попытка</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  Загрузка…
                </td>
              </tr>
            ) : !data.items.length ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  {anyFilter ? "Под фильтр ничего не подходит" : "Заказов нет"}
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 align-top last:border-0 hover:bg-neutral-50/60">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/orders/${r.id}`} className="font-medium text-[#8E1B47] hover:underline">
                      №{r.id}
                    </Link>
                    <div className="text-xs text-neutral-500">{r.lines} поз.</div>
                  </td>
                  <td className="max-w-48 px-2 py-2">
                    <div className="truncate">{r.customer?.name ?? "—"}</div>
                    {r.customer?.phone ? <div className="text-xs text-neutral-500">{r.customer.phone}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{rub(r.total)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-neutral-600">{short(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <SyncBadge state={r.sync} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-neutral-700">{r.oneCNumber ?? "—"}</td>
                  <td className="min-w-40 max-w-60 px-2 py-2 text-xs text-red-700">
                    <div className="line-clamp-3 whitespace-pre-line" title={r.error ?? undefined}>
                      {r.error ?? ""}
                    </div>
                    {r.nextTryAt ? <div className="mt-0.5 text-neutral-500">Повтор: {short(r.nextTryAt)}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-neutral-500">
                    {short(r.lastTryAt)}
                    {r.attempts > 1 ? <div>попыток: {r.attempts}</div> : null}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right">
                    {canRetry && (r.sync === "failed" || r.sync === "pending") ? (
                      <Btn size="sm" variant="outline" loading={busy.has(r.id)} onClick={() => retry(r.id)}>
                        Повторить отправку
                      </Btn>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {data && data.total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
          <span>
            Найдено: {data.total.toLocaleString("ru-RU")} · страница {page} из {pages}
          </span>
          <span className="flex items-center gap-2">
            <Select className="h-8 w-auto py-0 text-[13px]" value={String(data.limit)} onChange={(e) => setParam({ limit: e.target.value })}>
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  по {n}
                </option>
              ))}
            </Select>
            <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Назад
            </Btn>
            <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Дальше
            </Btn>
          </span>
        </div>
      ) : null}
    </div>
  );
}
