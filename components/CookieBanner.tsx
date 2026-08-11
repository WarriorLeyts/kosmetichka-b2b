"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem("cookie_consent");
      if (!accepted) setVisible(true);
    } catch {
      // localStorage unavailable — don't show banner
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem("cookie_consent", "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-4 pointer-events-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-slate-600 flex-1">
          Мы используем файлы{" "}
          <span className="font-semibold text-slate-800">cookie</span> для
          корректной работы сайта и улучшения пользовательского опыта. Продолжая использовать сайт, вы соглашаетесь с нашей{" "}
          <Link href="/privacy" className="text-pink-500 underline hover:no-underline">
            Политикой конфиденциальности
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-xl bg-pink-500 hover:bg-pink-600 active:bg-pink-700 px-5 py-2 text-sm font-semibold text-white transition"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
