"use client";

import { useState } from "react";

/** «Акции и новости» — consent to promo notifications (site «Уведомления» + push in the app). */
export function PromoToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const res = await fetch("/api/mobile/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushPromo: next }),
      });
      if (!res.ok) setOn(!next);
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">Уведомления</h2>
      <p className="mt-1 text-sm text-slate-500">
        Статусы заказов, ответы менеджера, бонусы и поступления приходят всегда — в{" "}
        <a href="/notifications" className="font-semibold text-violet-600">«Уведомления»</a> и push в приложении.
      </p>
      <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-bold text-slate-800">Акции и новости</span>
          <span className="block text-xs text-slate-400">Скидки, подборки и новинки</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>
    </div>
  );
}
