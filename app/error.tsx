"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <AlertCircle className="h-12 w-12 text-red-400" />
        </div>
        <h1 className="mb-2 text-2xl font-black text-slate-800">
          Что-то пошло не так
        </h1>
        <p className="mb-6 text-sm font-semibold text-slate-500">
          Произошла непредвиденная ошибка. Попробуйте обновить страницу.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white"
          >
            Попробовать снова
          </button>
          <Link
            href="/catalog"
            className="h-12 w-full rounded-2xl border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50"
          >
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
