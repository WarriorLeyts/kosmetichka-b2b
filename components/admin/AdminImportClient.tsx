"use client";

import { useState } from "react";

export function AdminImportClient() {
  const [loading, setLoading] = useState<"products" | "customers" | null>(null);
  const [message, setMessage] = useState("");

  async function runImport(type: "products" | "customers") {
    setLoading(type);
    setMessage("");

    const url =
      type === "products"
        ? "/api/admin/import/1c"
        : "/api/admin/import-customers";

    try {
      const res = await fetch(url, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Ошибка импорта");
        return;
      }

     if (type === "products" && data.success) {
  setMessage(
    `Импорт товаров завершен • Товаров: ${data.products} • Категорий: ${data.categories} • Брендов: ${data.brands} • Цен: ${data.prices} • Картинок: ${data.images} • Время: ${data.duration}`
  );

  return;
}

     if (type === "customers" && data.success) {
  setMessage(
    `Импорт контрагентов завершен • Контрагентов: ${data.customers} • Время: ${data.duration}`
  );

  return;
}

      setMessage(data.message || "Импорт завершен");
    } catch {
      setMessage("Ошибка соединения с сервером");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-4xl font-black text-transparent">
        Импорт из 1С
      </h1>

      <p className="mb-8 text-sm font-semibold text-slate-500">
        Загрузка товаров, цен, остатков, картинок и контрагентов из файлов 1С
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-black">Товары</h2>

          <p className="mb-5 text-sm font-semibold text-slate-500">
            Импортирует категории, товары, бренды, цены, остатки и картинки.
          </p>

          <button
            onClick={() => runImport("products")}
            disabled={loading !== null}
            className="rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {loading === "products" ? "Импортируем..." : "Импорт товаров"}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-black">Контрагенты</h2>

          <p className="mb-5 text-sm font-semibold text-slate-500">
            Импортирует покупателей из файла customers.xml.
          </p>

          <button
            onClick={() => runImport("customers")}
            disabled={loading !== null}
            className="rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {loading === "customers"
              ? "Импортируем..."
              : "Импорт контрагентов"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700">
          {message}
        </div>
      )}
    </main>
  );
}