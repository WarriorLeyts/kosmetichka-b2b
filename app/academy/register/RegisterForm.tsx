"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GraduationCap } from "lucide-react";

const SMARTCAPTCHA_CLIENT_KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY ?? "";

type SmartCaptcha = {
  render: (container: HTMLElement, params: object) => number;
  reset: (widgetId: number) => void;
};

type Field = "name" | "login" | "password" | "captcha";

const input =
  "h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300";

export default function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [field, setField] = useState<Field | null>(null);
  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const widgetId = useRef<number | null>(null);
  const captchaBox = useRef<HTMLDivElement>(null);

  const initCaptcha = useCallback(() => {
    const sc = (window as unknown as { smartCaptcha?: SmartCaptcha }).smartCaptcha;
    if (!sc || !captchaBox.current || widgetId.current !== null) return;
    widgetId.current = sc.render(captchaBox.current, {
      sitekey: SMARTCAPTCHA_CLIENT_KEY,
      callback: (t: string) => setCaptchaToken(t),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
    });
  }, []);

  function resetCaptcha() {
    const sc = (window as unknown as { smartCaptcha?: SmartCaptcha }).smartCaptcha;
    if (sc && widgetId.current !== null) sc.reset(widgetId.current);
    setCaptchaToken(null);
  }

  function fail(msg: string, f: Field | null = null) {
    setError(msg);
    setField(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) return fail("Пароли не совпадают", "password");
    if (!captchaToken) return fail("Подтвердите, что вы не робот", "captcha");
    fail("");
    setLoading(true);
    try {
      const res = await fetch("/api/academy/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, login, password, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fail(data.error || "Не удалось зарегистрироваться", data.field ?? null);
        resetCaptcha(); // токен капчи одноразовый
        return;
      }
      router.push("/academy");
      router.refresh();
    } catch {
      fail("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  const border = (f: Field) => (field === f ? "border-red-300" : "border-slate-200");

  return (
    <>
      <Script src="https://smartcaptcha.yandexcloud.net/captcha.js" strategy="afterInteractive" onLoad={initCaptcha} />
      <div className="flex min-h-[85vh] items-center justify-center py-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm"
          noValidate
        >
          <div className="mb-7 text-center">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-pink-500" />
            <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
              Регистрация сотрудника
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Аккаунт нужен, чтобы проходить тесты и сохранять результаты
            </p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Фамилия и имя</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иванова Анна"
                autoComplete="name"
                className={`${input} ${border("name")}`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Логин (латиницей)</span>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="anna.ivanova"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className={`${input} ${border("login")}`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Пароль (от 8 символов)</span>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`${input} ${border("password")} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Пароль ещё раз</span>
              <input
                type={show ? "text" : "password"}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                className={`${input} ${border("password")}`}
              />
            </label>

            <div ref={captchaBox} className={field === "captcha" ? "rounded-2xl ring-2 ring-red-300" : ""} />

            {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white disabled:opacity-60"
            >
              {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
            </button>

            <p className="text-center text-sm font-semibold text-slate-500">
              Уже есть аккаунт?{" "}
              <Link href="/academy/login" className="font-bold text-pink-500 hover:underline">
                Войти
              </Link>
            </p>
          </div>
        </form>
      </div>
    </>
  );
}
