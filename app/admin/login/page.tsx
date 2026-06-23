"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ login, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Ошибка входа");
      return;
    }

    router.push("/admin/customers");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-pink-500" />

          <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
            Вход менеджера
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Панель управления B2B
          </p>
        </div>

        <div className="space-y-4">
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Логин"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
          />

          {error && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="h-12 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white"
          >
            Войти
          </button>
        </div>
      </form>
    </main>
  );
}