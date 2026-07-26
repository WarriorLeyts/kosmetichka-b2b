import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <SearchX className="h-12 w-12 text-pink-400" />
        </div>
        <h1 className="mb-1 text-6xl font-black text-slate-200">404</h1>
        <h2 className="mb-2 text-xl font-black text-slate-800">
          Страница не найдена
        </h2>
        <p className="mb-6 text-sm font-semibold text-slate-500">
          Возможно, она была перемещена или удалена.
        </p>
        <Link
          href="/catalog"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white"
        >
          Перейти в каталог
        </Link>
      </div>
    </main>
  );
}
