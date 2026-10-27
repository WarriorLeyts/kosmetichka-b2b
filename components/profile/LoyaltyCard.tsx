"use client";

import { useCallback, useEffect, useState } from "react";
import { code128Modules, ean13Modules, runs } from "@/lib/barcode";

type Card = { number: string; name: string; level: string | null; cashback: string | null; bonuses: number; pendingBonuses: number };

/** EAN-13 like the printed card; other MAXMA numbers as Code 128 (the cash desks read both). */
function Barcode({ code }: { code: string }) {
  const mods = ean13Modules(code) ?? code128Modules(code);
  if (!mods) return <span className="text-black">{code}</span>;
  let x = 0;
  const bars = runs(mods).map(([bar, w], i) => {
    const r = bar ? <rect key={i} x={x} y={0} width={w} height={40} fill="#000" /> : null;
    x += w;
    return r;
  });
  return (
    <svg viewBox={`0 0 ${mods.length} 40`} preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label={`Штрихкод ${code}`}>
      <rect x={0} y={0} width={mods.length} height={40} fill="#fff" />
      {bars}
    </svg>
  );
}

/**
 * Profile → «Моя карта»: the MAXMA loyalty card (level, cashback, bonuses, barcode for the cash
 * desk), or «Добавить карту» — phone / card number → SMS code to the card owner → linked.
 * Same API as the app (/api/mobile/loyalty*).
 */
export function LoyaltyCard({ phone }: { phone: string | null }) {
  const [state, setState] = useState<"loading" | "off" | "none" | "card" | "error">("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState(phone ?? "");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile/loyalty", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "");
      if (d.card) {
        setCard(d.card);
        setState("card");
      } else setState(d.reason === "not_configured" ? "off" : "none");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: object) {
    const res = await fetch("/api/mobile/loyalty/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Не получилось. Попробуйте ещё раз.");
    return d;
  }

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!query.trim()) return setError("Введите номер телефона или карты");
    setBusy(true);
    setError("");
    try {
      const d = await post({ query: query.trim() });
      setCode("");
      setSentTo(d.phone ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!code) return setError("Введите код из СМС");
    setBusy(true);
    setError("");
    try {
      const d = await post({ code });
      setCard(d.card);
      setState("card");
      setAdding(false);
      setSentTo(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm2()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mobile/loyalty", { method: "DELETE" });
      if (res.ok) {
        setCard(null);
        setState("none");
      }
    } finally {
      setBusy(false);
    }
  }
  const confirm2 = () => window.confirm("Отвязать карту? Её можно будет добавить снова по номеру телефона или карты.");

  if (state === "loading" || state === "off") return null;
  if (state === "error") {
    return (
      <div className="mb-4 rounded-2xl border bg-white p-6 text-sm text-slate-500">
        Программа лояльности сейчас недоступна.{" "}
        <button type="button" onClick={load} className="font-bold text-violet-600 underline">
          Повторить
        </button>
      </div>
    );
  }

  const cardFace = (
    <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-xl text-white shadow-[0_8px_22px_rgba(10,70,142,0.35)]" style={{ background: "linear-gradient(#024697,#004290)" }}>
      <div className="flex h-14 items-center px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app/card/card-logo.png" alt="" className="h-11 w-12 object-contain" />
        <span className="ml-1 text-lg font-bold tracking-wide">КОСМЕТИЧКА</span>
        {card ? (
          <div className="ml-auto text-right leading-tight">
            {card.level ? <div className="text-[10px] font-bold uppercase">{card.level}</div> : null}
            <div className="text-sm">{card.name}</div>
          </div>
        ) : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/app/card/card-banner.webp" alt="" className="h-[132px] w-full object-cover" />
      {card ? (
        <div className="flex justify-between px-3.5 py-2.5">
          <div>{card.cashback ? <><div className="text-[10px] font-bold">КЕШБЭК</div><div>{card.cashback}</div></> : null}</div>
          <div className="text-right">
            <div className="text-[10px] font-bold">БОНУСЫ</div>
            <div>{card.bonuses.toLocaleString("ru-RU")}</div>
          </div>
        </div>
      ) : (
        <div className="py-3 text-center text-sm font-bold">+ ДОБАВИТЬ КАРТУ</div>
      )}
      {card && showCode ? (
        <div className="mx-6 mb-4 rounded bg-white px-4 py-2 text-center">
          <Barcode code={card.number} />
          <div className="mt-1 text-xs tracking-wide text-slate-900">{card.number}</div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mb-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-slate-900">Моя карта</h2>

      {card ? (
        <>
          <button type="button" onClick={() => setShowCode((v) => !v)} className="block w-full" aria-label={showCode ? "Скрыть штрихкод" : "Показать штрихкод"}>
            {cardFace}
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setShowCode((v) => !v)} className="text-sm font-bold text-violet-600">
              {showCode ? "Скрыть штрихкод" : "Показать штрихкод для кассы"}
            </button>
            <button type="button" onClick={unlink} disabled={busy} className="text-sm text-slate-400 hover:text-slate-600">
              Отвязать карту
            </button>
          </div>
          {card.pendingBonuses > 0 ? (
            <p className="mt-2 text-xs text-slate-500">Ещё {card.pendingBonuses.toLocaleString("ru-RU")} бонусов скоро станут доступны</p>
          ) : null}
        </>
      ) : !adding ? (
        <button type="button" onClick={() => setAdding(true)} className="block w-full" aria-label="Добавить карту лояльности">
          {cardFace}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {sentTo !== undefined
              ? `Мы отправили код в СМС${sentTo ? ` на ${sentTo}` : " на телефон, указанный в карте"}.`
              : "Укажите телефон, на который оформлена карта лояльности, или номер карты."}
          </p>
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
          {sentTo === undefined ? (
            <form onSubmit={find} className="space-y-3">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setError(""); }}
                inputMode="tel"
                placeholder="+7 900 000-00-00"
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? "Ищем…" : "Найти карту"}
                </button>
                <button type="button" onClick={() => { setAdding(false); setError(""); }} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={confirm} className="space-y-3">
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="Код из СМС"
                className="w-full rounded-xl border px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className="rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? "Проверяем…" : "Добавить карту"}
                </button>
                <button type="button" onClick={() => { setSentTo(undefined); setError(""); }} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
                  Изменить номер
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
