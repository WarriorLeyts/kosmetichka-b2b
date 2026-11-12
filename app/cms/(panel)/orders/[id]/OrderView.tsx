"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Badge, Btn, Card, Empty, PageHeader } from "@/components/cms/ui";
import { OUTCOME_LABELS, SYNC_LABELS, TRIGGER_LABELS, type SyncState } from "@/lib/cms/orderSync";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { ROLE_LABELS } from "@/lib/roles";
import { rub, StatusBadge, SyncBadge } from "../sync";

type Attempt = { id: number; at: string; durationMs: number; outcome: string; trigger: string; by: string | null; docNumber: string | null; error: string | null };
type Data = {
  order: {
    id: number;
    status: string;
    total: number;
    discount: number;
    bonusesApplied: number;
    promoCode: string | null;
    priceType: string | null;
    priceTier: string | null;
    deliveryType: string | null;
    deliveryAddress: string | null;
    comment: string | null;
    createdAt: string;
    oneCExportedAt: string | null;
    oneCRef: string | null;
    oneCNumber: string | null;
    oneCStockRef: string | null;
    oneCStockNumber: string | null;
    oneCError: string | null;
    oneCNextTryAt: string | null;
    oneCSendingAt: string | null;
    sync: SyncState;
    customer: { id: number; name: string | null; companyName: string | null; phone: string | null; oneCId: string | null; manager: string | null; priceType: string } | null;
    items: { id: number; productId: number; productName: string; barcode: string | null; quantity: number; price: number; total: number; discount: number; bonusDiscount: number }[];
  };
  attempts: Attempt[];
  statusLog: { from: string | null; to: string; at: string; by: string | null }[];
  odata: boolean;
};

const OUTCOME_TONE: Record<string, "green" | "red" | "amber"> = { created: "green", linked: "green", problem: "amber", error: "red" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <div className="w-32 shrink-0 text-neutral-500 sm:w-40">{label}</div>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

export function OrderView({ id, canRetry }: { id: number; canRetry: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await cmsApi<Data>(`/api/cms/orders/${id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }, [id]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const retry = async () => {
    setBusy(true);
    try {
      const r = await cmsApi<{ sync: SyncState; error: string | null; oneCNumber: string | null }>(`/api/cms/orders/${id}/retry`, { method: "POST" });
      if (r.sync === "synced") toast.success(`Передан в 1С${r.oneCNumber ? `: ${r.oneCNumber}` : ""}`);
      else toast.error(`Не передан: ${r.error ?? SYNC_LABELS[r.sync]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      load();
    }
  };

  if (err) return <Empty>{err}</Empty>;
  if (!data) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const o = data.order;
  const c = o.customer;
  const canSend = canRetry && (o.sync === "failed" || o.sync === "pending");

  return (
    <div className="max-w-6xl">
      <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-[#8E1B47]">
        <ArrowLeft className="size-4" /> Заказы
      </Link>
      <PageHeader
        title={`Заказ №${o.id}`}
        subtitle={`от ${fmtDate(o.createdAt)}`}
        actions={
          <>
            <Btn variant="outline" onClick={load}>
              <RefreshCw className="size-4" /> Обновить
            </Btn>
            <a href={`https://kosmetichka-opt.ru/admin/order/${o.id}`} target="_blank" rel="noreferrer">
              <Btn variant="outline">
                <ExternalLink className="size-4" /> Открыть в Team
              </Btn>
            </a>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">Обмен с 1С</span>
            <SyncBadge state={o.sync} />
          </div>
          <Row label="Документ 1С">{o.oneCNumber ?? "—"}</Row>
          {o.oneCStockNumber ? <Row label="Документ склада">{o.oneCStockNumber}</Row> : null}
          {o.oneCRef ? (
            <Row label="Идентификатор 1С">
              <span className="font-mono text-xs">{o.oneCRef}</span>
              {o.oneCStockRef ? <div className="font-mono text-xs">{o.oneCStockRef}</div> : null}
            </Row>
          ) : null}
          <Row label="Передан">{fmtDate(o.oneCExportedAt)}</Row>
          {o.sync !== "synced" && o.oneCError ? (
            <Row label="Ошибка">
              <span className="whitespace-pre-line text-red-700">{o.oneCError}</span>
            </Row>
          ) : null}
          {(o.sync === "failed" || o.sync === "pending") && o.oneCNextTryAt ? <Row label="Следующий повтор">{fmtDate(o.oneCNextTryAt)}</Row> : null}
          {o.sync === "waiting" ? (
            <p className="mt-2 text-xs text-neutral-500">Заказ уйдёт в 1С автоматически, когда менеджер переведёт его в «Заказ оформлен».</p>
          ) : null}
          {o.sync === "sending" ? (
            <p className="mt-2 text-xs text-neutral-500">
              Идёт отправка (или 1С не ответила — тогда следующая попытка сначала проверит, не создан ли уже документ).
            </p>
          ) : null}
          {!data.odata ? <p className="mt-2 text-xs text-amber-700">Отправка заказов в 1С по OData выключена на сервере.</p> : null}
          {canSend ? (
            <Btn className="mt-3" onClick={retry} loading={busy} disabled={!data.odata}>
              Повторить отправку
            </Btn>
          ) : null}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">Заказ</span>
            <StatusBadge status={o.status} />
          </div>
          <Row label="Покупатель">
            {c ? (
              <>
                {c.companyName || c.name || "Без имени"}
                {c.phone ? <span className="text-neutral-500"> · {c.phone}</span> : null}
              </>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Код в 1С">{c?.oneCId ?? <span className="text-amber-700">не связан с 1С</span>}</Row>
          {c?.manager ? <Row label="Группа в 1С">{c.manager}</Row> : null}
          <Row label="Тип цены">{ROLE_LABELS[o.priceTier || o.priceType || ""] ?? o.priceTier ?? o.priceType ?? "—"}</Row>
          <Row label="Доставка">
            {o.deliveryType === "pickup" ? "Заберу в магазине" : o.deliveryType === "delivery" ? `Доставка${o.deliveryAddress ? `: ${o.deliveryAddress}` : ""}` : "—"}
          </Row>
          {o.comment ? (
            <Row label="Комментарий">
              <span className="whitespace-pre-line">{o.comment}</span>
            </Row>
          ) : null}
          {o.promoCode ? <Row label="Промокод">{`${o.promoCode} (−${rub(o.discount)})`}</Row> : null}
          {o.bonusesApplied ? <Row label="Бонусы">−{rub(o.bonusesApplied)}</Row> : null}
          <Row label="Сумма">
            <b>{rub(o.total)}</b>
          </Row>
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <div className="px-5 pt-4 font-medium">Состав · {o.items.length} поз.</div>
        <table className="mt-2 w-full min-w-[700px] text-sm">
          <thead className="border-y border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
            <tr>
              <th className="px-5 py-2">Товар</th>
              <th className="px-2 py-2">Штрихкод</th>
              <th className="px-2 py-2 text-right">Кол-во</th>
              <th className="px-2 py-2 text-right">Цена</th>
              <th className="px-2 py-2 text-right">Скидка</th>
              <th className="px-5 py-2 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((it) => (
              <tr key={it.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-5 py-2">
                  <Link href={`/products/${it.productId}`} className="hover:text-[#8E1B47]">
                    {it.productName}
                  </Link>
                </td>
                <td className="px-2 py-2 text-xs text-neutral-500">{it.barcode ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{rub(it.price)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{it.discount + it.bonusDiscount ? `−${rub(it.discount + it.bonusDiscount)}` : ""}</td>
                <td className="px-5 py-2 text-right tabular-nums">{rub(it.total - it.discount - it.bonusDiscount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <div className="mb-2 font-medium">Журнал передачи в 1С</div>
          {!data.attempts.length ? (
            <p className="text-sm text-neutral-500">
              {o.sync === "synced" ? "Заказ передан до появления журнала — попыток не записано." : "Попыток ещё не было."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {data.attempts.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-neutral-600">{fmtDate(a.at)}</span>
                    <Badge tone={OUTCOME_TONE[a.outcome] ?? "neutral"}>{OUTCOME_LABELS[a.outcome] ?? a.outcome}</Badge>
                    {a.docNumber ? <span>{a.docNumber}</span> : null}
                    <span className="text-xs text-neutral-500">
                      {TRIGGER_LABELS[a.trigger] ?? a.trigger}
                      {a.by ? ` · ${a.by}` : ""} · {(a.durationMs / 1000).toFixed(1)} с
                    </span>
                  </div>
                  {a.error ? <div className="mt-0.5 whitespace-pre-line text-xs text-red-700">{a.error}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-2 font-medium">История статусов</div>
          {!data.statusLog.length ? (
            <p className="text-sm text-neutral-500">Нет записей</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.statusLog.map((s, i) => (
                <li key={i}>
                  <span className="tabular-nums text-neutral-600">{fmtDate(s.at)}</span> · {s.from ? `${ORDER_STATUS_LABELS[s.from] ?? s.from} → ` : ""}
                  {ORDER_STATUS_LABELS[s.to] ?? s.to}
                  {s.by ? <span className="text-neutral-500"> · {s.by}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
