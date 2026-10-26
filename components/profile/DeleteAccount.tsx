"use client";

import { useState } from "react";

/** «Удалить аккаунт»: personal data erased, orders stay without a name (DELETE /api/mobile/profile). */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!password || busy) return;
    if (!confirm("Удалить аккаунт навсегда? Восстановить его будет нельзя.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mobile/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось удалить аккаунт");
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аккаунт");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-red-100 bg-white p-6">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-red-600">
          Удалить аккаунт
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Ваши имя, телефон, e-mail, адрес и карта лояльности будут удалены, войти в аккаунт будет нельзя.
            Оформленные заказы останутся у магазина для учёта, но без ваших данных.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Пароль для подтверждения"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border p-3 text-sm"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={remove} disabled={!password || busy} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
              {busy ? "Удаляем…" : "Удалить навсегда"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-bold">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
