"use client";

import Link from "next/link";
import Script from "next/script";
import { useState, useRef, useCallback } from "react";
import { Heart, Send, MessageSquare, RefreshCw, Eye, EyeOff } from "lucide-react";

const SMARTCAPTCHA_CLIENT_KEY =
  process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY ||
  "ysc1_AIlB5l676p4E3nWbyFmxE0sUSMjxgl6yNGfzUlVff6f9a1e5";

declare global {
  interface Window {
    smartCaptcha?: {
      render: (container: HTMLElement, params: object) => number;
      reset: (widgetId: number) => void;
      destroy: (widgetId: number) => void;
    };
  }
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // SMS step
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initCaptcha = useCallback(() => {
    if (!window.smartCaptcha || !containerRef.current || widgetIdRef.current !== null) return;

    widgetIdRef.current = window.smartCaptcha.render(containerRef.current, {
      sitekey: SMARTCAPTCHA_CLIENT_KEY,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
    });
  }, []);

  function resetCaptcha() {
    if (window.smartCaptcha && widgetIdRef.current !== null) {
      window.smartCaptcha.reset(widgetIdRef.current);
    }
    setCaptchaToken(null);
  }

  function startCooldown() {
    setSmsCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setSmsCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendSms() {
    setError("");

    if (!phone.trim()) {
      setError("Укажите номер телефона");
      return;
    }

    if (!captchaToken) {
      setError("Пожалуйста, пройдите проверку капчи");
      return;
    }

    setSmsLoading(true);

    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    setSmsLoading(false);

    if (!res.ok) {
      setError(data.error || "Не удалось отправить SMS");
      return;
    }

    setSmsSent(true);
    startCooldown();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!captchaToken) {
      setError("Пожалуйста, пройдите проверку капчи");
      return;
    }

    if (!smsSent || !smsCode.trim()) {
      setError("Введите код подтверждения из SMS");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, password, captchaToken, smsCode }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    setLoading(false);
    resetCaptcha();

    if (!res.ok) {
      setError(data.error || "Ошибка регистрации");
      return;
    }

    if (data.autoLogin) {
      window.location.href = "/catalog";
      return;
    }

    setSuccess(
      data.message || "Заявка отправлена. Ожидайте подтверждения администратора."
    );

    setName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setSmsCode("");
    setSmsSent(false);
  }

  return (
    <>
      <Script
        src="https://smartcaptcha.yandexcloud.net/captcha.js"
        strategy="afterInteractive"
        onLoad={initCaptcha}
      />

      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mb-3 flex justify-center">
              <Heart className="h-10 w-10 text-pink-500" />
            </div>

            <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
              Регистрация
            </h1>

            <p className="mt-2 text-sm font-semibold text-slate-500">
              Оставьте заявку на доступ к B2B-каталогу
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <input
              required
              type="text"
              placeholder="Имя / Название компании"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {/* ─── Телефон + кнопка «Получить код» ──────────────── */}
            <div className="flex gap-2">
              <input
                required
                type="text"
                placeholder="Телефон"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (smsSent) {
                    setSmsSent(false);
                    setSmsCode("");
                  }
                }}
              />
              <button
                type="button"
                disabled={smsLoading || smsCooldown > 0 || !captchaToken}
                onClick={handleSendSms}
                className="flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {smsLoading ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <MessageSquare size={15} />
                )}
                {smsCooldown > 0
                  ? `${smsCooldown}с`
                  : smsSent
                  ? "Ещё раз"
                  : "Код SMS"}
              </button>
            </div>

            {/* ─── Поле для ввода SMS-кода ───────────────────────── */}
            {smsSent && (
              <div>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="• • • •"
                  className="h-12 w-full rounded-2xl border border-pink-300 bg-pink-50 px-4 text-center text-2xl font-black tracking-[0.5em] outline-none focus:border-pink-400"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                />
                <p className="mt-1 text-center text-xs font-semibold text-slate-400">
                  Введите 4-значный код из SMS
                </p>
              </div>
            )}

            <input
              required
              type="email"
              placeholder="Email"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="relative">
              <input
                required
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

            {/* ─── Yandex SmartCaptcha ──────────────────────────── */}
            <div ref={containerRef} />

            {error && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-600">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !captchaToken || !smsSent || smsCode.length < 4}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white disabled:opacity-50"
            >
              <Send size={18} />
              {loading ? "Отправляем..." : "Отправить заявку"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-semibold text-slate-500">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-pink-500 hover:underline">
              Войти
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
