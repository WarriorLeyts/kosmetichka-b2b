"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Eye, EyeOff, AlertCircle, ChevronLeft } from "lucide-react";
import { Wordmark } from "@/components/app/Wordmark";
import { ThemeToggle } from "@/components/app/ThemeToggle";

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
    <main className="app-auth">
      <div className="app-auth__blob" aria-hidden />
      <div className="app-auth__wrap">
        <div className="app-auth__top">
          <Link href="/" className="app-auth__back" aria-label="На главную">
            <ChevronLeft size={26} />
          </Link>
          <span className="app-auth__bar-title">Вход</span>
          <ThemeToggle className="app-auth__theme" />
        </div>
        <div className="app-auth__brand"><Wordmark size={22} /></div>
        <h1 className="app-auth__h1">С возвращением!</h1>
        <p className="app-auth__lead">Войдите, чтобы видеть свои цены и заказы</p>

        <form onSubmit={handleLogin} className="app-panel">
          <label className="app-field">
            <span className="app-field__label">Телефон или email</span>
            <span className="app-field__box">
              <input
                type="text"
                inputMode="email"
                placeholder="Телефон или email"
                autoComplete="username"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </span>
          </label>

          <label className="app-field">
            <span className="app-field__label">Пароль</span>
            <span className="app-field__box">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Пароль"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="app-field__eye"
                tabIndex={-1}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </span>
          </label>

          {error && (
            <div className="app-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="app-btn" style={{ width: "100%", marginTop: 4 }}>
            <LogIn size={20} />
            {loading ? "Входим…" : "Войти"}
          </button>

          <Link href="/forgot-password" className="app-auth__forgot">Забыли пароль?</Link>
        </form>

        <div className="app-panel" style={{ marginTop: 16, paddingBottom: 18 }}>
          <h2 className="app-auth__h2">Ещё нет аккаунта?</h2>
          <Link href="/register" className="app-btn app-btn--outline" style={{ width: "100%" }}>
            Зарегистрироваться
          </Link>
        </div>

        <div className="app-auth__legal">
          <Link href="/privacy">Политика конфиденциальности</Link>
          <span>·</span>
          <Link href="/agreement">Соглашение</Link>
        </div>
      </div>
    </main>
  );
}
