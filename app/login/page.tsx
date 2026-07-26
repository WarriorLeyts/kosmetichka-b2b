"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
            type="email"
            placeholder="Email"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Пароль"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

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

        <p className="mt-6 text-center text-sm font-semibold text-slate-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-pink-500 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </main>
  );
}