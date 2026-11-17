"use client";
import { useState } from "react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";
import { type PromoSettings } from "@/lib/promoSchema";
import { type CartPricing, priceTypeLabel } from "@/lib/pricing";
import { Btn, Card, Field, Input, Toggle } from "@/components/cms/ui";
export function PricingEditor({ p, set, canEdit, onVerified }: { p: PromoSettings; set: (patch: Partial<PromoSettings>) => void; canEdit: boolean; onVerified: (settings: string) => void }) {
  const [subtotal, setSubtotal] = useState(100000);
  const [shock, setShock] = useState(20000);
  const [customer, setCustomer] = useState("wholesale");
  const [result, setResult] = useState<{ key: string; pricing: CartPricing } | null>(null);
  const [busy, setBusy] = useState(false);
  const pricing = p.pricing!;
  const key = JSON.stringify([p, subtotal, shock, customer]);
  const patch = (v: Partial<typeof pricing>) => set({ pricing: { ...pricing, ...v } });
  const check = async () => {
    setBusy(true);
    try {
      const r = await cmsApi<{ pricing: CartPricing }>("/api/cms/settings/promo/preview", { method: "POST", body: { settings: p, subtotal, shockSubtotal: shock, customer } });
      setResult({ key, pricing: r.pricing }); onVerified(JSON.stringify(p));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка расчёта"); }
    finally { setBusy(false); }
  };
  const r = result?.key === key ? result.pricing : null;
  const money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
  return <>
    <Card className="space-y-4 p-5">
      <h2 className="font-semibold">Цены и скидки</h2>
      <p className="text-sm text-neutral-500">Эти условия и оформление работают по общим датам. После окончания возвращаются обычные цены, опт от 5 000 ₽ и крупный опт от 50 000 ₽.</p>
      <fieldset disabled={!canEdit} className="space-y-4">
        <Toggle checked={pricing.usePromoPrices} onChange={v => patch({ usePromoPrices: v })} label="Применять акционные цены из 1С" />
        <p className="text-xs text-neutral-500">В 1С заполните цены «Акция Розница», «Акция Опт», «Акция Крупный опт» и выгрузите их на сайт. Если акционной цены нет, применяется обычная. Дополнительная скидка на акционные цены не начисляется.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Опт от, ₽"><Input type="number" min={1} value={pricing.wholesaleMin} onChange={e => patch({ wholesaleMin: Number(e.target.value) })} /></Field>
          <Field label="Крупный опт от, ₽"><Input type="number" min={1} value={pricing.bigWholesaleMin} onChange={e => patch({ bigWholesaleMin: Number(e.target.value) })} /></Field>
        </div>
        <h3 className="text-sm font-medium">Дополнительная скидка оптовым клиентам</h3>
        <p className="text-xs text-neutral-500">Сумма всех товаров определяет ступень. Скидка начисляется только на товары без акционной цены. Применяется один максимальный процент.</p>
        {pricing.discountSteps.map((step, i) => <div className="flex items-end gap-2" key={i}>
          <Field className="min-w-0 flex-1" label={`Сумма от, ₽ · ступень ${i + 1}`}><Input type="number" min={1} value={step.from} onChange={e => patch({ discountSteps: pricing.discountSteps.map((s, j) => j === i ? { ...s, from: Number(e.target.value) } : s) })} /></Field>
          <Field className="min-w-0 flex-1" label="Скидка, %"><Input type="number" min={0.01} max={100} step={0.01} value={step.percent} onChange={e => patch({ discountSteps: pricing.discountSteps.map((s, j) => j === i ? { ...s, percent: Number(e.target.value) } : s) })} /></Field>
          <Btn onClick={() => patch({ discountSteps: pricing.discountSteps.filter((_, j) => j !== i) })}>Убрать</Btn>
        </div>)}
        <Btn disabled={pricing.discountSteps.length >= 10} onClick={() => { const last = pricing.discountSteps.at(-1); patch({ discountSteps: [...pricing.discountSteps, { from: (last?.from ?? 0) + 10000, percent: Math.min(100, (last?.percent ?? 0) + 1) }] }); }}>Добавить ступень</Btn>
      </fieldset>
    </Card>
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Проверить расчёт перед публикацией</h2>
      <p className="text-xs text-neutral-500">Учебный пример на первый день акции. Введите сумму уже по ценам выбранного тарифа. Для проверки перехода между тарифами в этом примере используются одинаковые цены. Заказ не создаётся.</p>
      {!p.enabled && <p className="text-sm text-amber-700">Акция выключена: проверка покажет расчёт без акции. Для проверки скидок включите её в черновике.</p>}
      <Field label="Тип клиента"><select className="w-full rounded-lg border p-2" value={customer} onChange={e => setCustomer(e.target.value)}><option value="retail">Розница</option><option value="discount">Скидочная карта</option><option value="wholesale">Опт</option><option value="big_wholesale">Крупный опт</option></select></Field>
      <Field label="Общая сумма, ₽"><Input type="number" value={subtotal} onChange={e => setSubtotal(Number(e.target.value))} /></Field>
      <Field label="В том числе товары с акционной ценой, ₽"><Input type="number" value={shock} onChange={e => setShock(Number(e.target.value))} /></Field>
      <Btn disabled={!canEdit} loading={busy} onClick={check}>Проверить расчёт</Btn>
      {r && <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Тариф: {priceTypeLabel(r.tier)}<br />Дополнительная скидка: {r.percent}% от {money(r.eligibleSubtotal)} = {money(r.discount)}<br /><strong>Итого: {money(r.total)}</strong></div>}
    </Card>
  </>;
}
