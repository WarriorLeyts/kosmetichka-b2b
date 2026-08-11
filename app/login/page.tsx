"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, LogIn, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка входа");
      return;
    }

    router.push("/catalog");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <Heart className="h-10 w-10 text-pink-500" />
          </div>

          <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
            Вход клиента
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Войдите в B2B-кабинет Косметички
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            inputMode="email"
            placeholder="Email или телефон"
            autoComplete="email"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-semibold outline-none focus:border-pink-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
              tabIndex={-1}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm font-semibold text-slate-500">
          <Link href="/forgot-password" className="text-slate-400 hover:text-pink-500 hover:underline">
            Забыли пароль?
          </Link>
          <span>
            Нет аккаунта?{" "}
            <Link href="/register" className="text-pink-500 hover:underline">
              Зарегистрироваться
            </Link>
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-400 space-x-3">
          <Link href="/privacy" className="hover:text-pink-500 hover:underline transition-colors">Политика конфиденциальности</Link>
          <span>·</span>
          <Link href="/agreement" className="hover:text-pink-500 hover:underline transition-colors">Соглашение</Link>
        </div>
      </div>
    </main>
  );
}