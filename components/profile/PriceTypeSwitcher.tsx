"use client";

import { useState } from "react";
import { SITE_RETAIL_ENABLED } from "@/lib/siteMode";

type Option = { value: string; label: string; state: "current" | "available" | "request" | "pending" };
type Info = {
  priceType: string;
  priceTypeLabel: string;
  roleRequest: string | null;
  roleRequestStatus: string | null;
  roleOptions: Option[];
};

const LABELS: Record<string, string> = { retail: "Розница", wholesale: "Опт", big_wholesale: "Крупный опт" };
const HINTS: Record<string, string> = {
  retail: "Розничные цены, бонусы MAXMA начисляются и списываются",
  wholesale: "Оптовые цены, заказ от 5 000 ₽, без бонусов",
  big_wholesale: "Цены крупного опта, заказ от 50 000 ₽, без бонусов",
};

/**
 * Profile: switch between «Розница» and the wholesale price types the admin granted,
 * or send a request for a wholesale type (approved by an admin, like a wholesale registration).
 */
export function PriceTypeSwitcher({ initial }: { initial: Info }) {
  const [info, setInfo] = useState(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // on the site for now only «Опт» / «Крупный опт» can be chosen (retail is in the app)
  const options = SITE_RETAIL_ENABLED
    ? info.roleOptions
    : info.roleOptions.filter((o) => o.value === "wholesale" || o.value === "big_wholesale" || o.state === "current");

  // hidden only when there is nothing to choose
  if (options.length < 2) return null;

  async function pick(o: Option) {
    if (busy || o.state === "current" || o.state === "pending") return;
    if (o.state === "request" && !confirm(`Отправить заявку на «${o.label}»? Доступ откроется после подтверждения менеджером.`)) return;
    if (o.state === "available" && !confirm(`Перейти на «${o.label}»? Цены в каталоге и корзине пересчитаются.`)) return;
    setBusy(o.value);
    setMsg(null);
    try {
      const res = await fetch("/api/mobile/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceType: o.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось");
      if (data.switched) {
        // prices, cart and bonuses everywhere follow the new type
        window.location.reload();
        return;
      }
      setInfo(data);
      if (data.requested) setMsg({ ok: true, text: "Заявка отправлена. Менеджер проверит её и откроет доступ." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Не удалось" });
    } finally {
      setBusy("");
    }
  }

  async function withdraw() {
    setBusy("withdraw");
    try {
      const res = await fetch("/api/mobile/role", { method: "DELETE" });
      if (res.ok) setInfo(await res.json());
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mb-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">Тип цен</h2>
      <p className="mt-1 text-sm text-slate-500">Сейчас: {info.priceTypeLabel}</p>

      <div className="mt-4 space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={!!busy || o.state === "current" || o.state === "pending"}
            onClick={() => pick(o)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition ${
              o.state === "current" ? "border-pink-400 bg-pink-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span>
              <span className={`block text-sm font-black ${o.state === "current" ? "text-pink-600" : "text-slate-800"}`}>{o.label}</span>
              {HINTS[o.value] ? <span className="block text-xs text-slate-400">{HINTS[o.value]}</span> : null}
            </span>
            <span className="shrink-0 text-xs font-bold">
              {o.state === "current" ? (
                <span className="text-pink-600">✓ Выбрано</span>
              ) : o.state === "available" ? (
                <span className="text-violet-600">{busy === o.value ? "…" : "Перейти"}</span>
              ) : o.state === "pending" ? (
                <span className="text-amber-600">На рассмотрении</span>
              ) : (
                <span className="text-slate-500">{busy === o.value ? "…" : "Отправить заявку"}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {info.roleRequestStatus === "pending" && info.roleRequest ? (
        <p className="mt-3 text-xs text-slate-500">
          Заявка на «{LABELS[info.roleRequest] ?? info.roleRequest}» ждёт подтверждения менеджера.{" "}
          <button type="button" onClick={withdraw} disabled={!!busy} className="font-bold text-slate-700 underline">
            Отозвать
          </button>
        </p>
      ) : info.roleRequestStatus === "rejected" && info.roleRequest ? (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">
          Заявка на «{LABELS[info.roleRequest] ?? info.roleRequest}» отклонена. Можно отправить новую или связаться с менеджером.
        </p>
      ) : null}

      {msg ? <p className={`mt-3 text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p> : null}
    </div>
  );
}
