"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Произошла ошибка. Попробуйте позже.");
      return;
    }

    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <Heart className="h-10 w-10 text-pink-500" />
          </div>
          <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
            Сброс пароля
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Введите email — отправим ссылку для смены пароля
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <Mail className="h-8 w-8 text-green-500" />
            </div>
            <p className="font-bold text-slate-700">Письмо отправлено!</p>
            <p className="mt-2 text-sm text-slate-500">
              Если аккаунт с таким email существует, мы отправили инструкцию по смене пароля.
              Проверьте папку «Спам», если письмо не пришло.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm font-semibold text-pink-500 hover:underline"
            >
              ← Вернуться к входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Ваш email"
              autoComplete="email"
              required
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              {loading ? "Отправляем..." : "Отправить ссылку"}
            </button>

            <p className="text-center text-sm text-slate-500">
              <Link href="/login" className="font-semibold text-pink-500 hover:underline">
                ← Вернуться к входу
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
