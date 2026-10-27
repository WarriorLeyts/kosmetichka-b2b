"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, GraduationCap } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      const next = params.get("next");
      router.push(next && next.startsWith("/academy") ? next : "/academy");
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-pink-500" />
          <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
            Тесты для сотрудников
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Войдите под своим рабочим логином и паролем
          </p>
        </div>

        <div className="space-y-4">
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Логин"
            autoComplete="username"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-semibold outline-none focus:border-pink-300"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white disabled:opacity-60"
          >
            {loading ? "Входим…" : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}
