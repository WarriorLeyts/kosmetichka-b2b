"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface ExportButtonProps {
  orderCount: number;
  totalSum: number;
}

export function ExportButton({ orderCount, totalSum }: ExportButtonProps) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleExport() {
    setStep("loading");
    try {
      const res = await fetch("/api/admin/orders/export", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Ошибка ${res.status}`);
      }
      // Trigger file download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Orders.xml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStep("done");
      // Refresh page so exported orders disappear from the list
      setTimeout(() => router.refresh(), 1500);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Неизвестная ошибка");
      setStep("error");
    }
  }

  if (orderCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-400">
        <Download size={32} className="mx-auto mb-3 opacity-30" />
        <p className="font-semibold">Нет заказов для выгрузки</p>
        <p className="mt-1 text-sm">Заказы со статусом «К оплате» или «Подтверждён» появятся здесь</p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 size={40} className="text-green-500" />
        <p className="text-lg font-black text-green-700">Выгружено успешно!</p>
        <p className="text-sm text-green-600">
          {orderCount} заказов переведены в статус «Выгружен в 1С» и файл скачан.
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle size={40} className="text-red-500" />
        <p className="text-lg font-black text-red-700">Ошибка выгрузки</p>
        <p className="text-sm text-red-600">{errorMsg}</p>
        <button
          onClick={() => setStep("idle")}
          className="mt-2 rounded-xl border border-red-300 px-5 py-2 text-sm font-bold text-red-600 hover:bg-red-100 transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview card */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Download size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="font-black text-slate-800">Готово к выгрузке</p>
            <p className="text-sm text-slate-500">Статусы: «Подтверждён» и «К оплате»</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-3xl font-black text-indigo-600">{orderCount}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">заказов</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-3xl font-black text-emerald-600">
              {(totalSum / 1000).toFixed(0)}к
            </p>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              {totalSum.toLocaleString("ru-RU")} ₽
            </p>
          </div>
        </div>

        {step === "idle" && (
          <button
            onClick={() => setStep("confirm")}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
          >
            Выгрузить в 1С →
          </button>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700">
                  После выгрузки {orderCount} заказов получат статус{" "}
                  <strong>«Выгружен в 1С»</strong>. Это действие нельзя отменить.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("idle")}
                className="flex-1 rounded-xl border py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleExport}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition-colors"
              >
                Да, выгрузить
              </button>
            </div>
          </div>
        )}

        {step === "loading" && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3">
            <Loader2 size={16} className="animate-spin text-slate-500" />
            <span className="text-sm font-semibold text-slate-600">Выгружаем...</span>
          </div>
        )}
      </div>

      {/* Preview link */}
      <a
        href="/api/admin/orders/export"
        target="_blank"
        className="block rounded-xl border border-dashed border-slate-200 px-4 py-3 text-center text-sm text-slate-400 hover:text-indigo-500 hover:border-indigo-200 transition-colors"
      >
        Предпросмотр XML (без смены статусов)
      </a>
    </div>
  );
}
