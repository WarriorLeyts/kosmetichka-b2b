"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, GitCompareArrows } from "lucide-react";
import { useCompareStore } from "@/store/compareStore";
import { SafeImage } from "@/components/catalog/SafeImage";

export function CompareBar() {
  const items = useCompareStore((s) => s.items);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  // SSR-safe hydration guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || items.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.10)] animate-in slide-in-from-bottom-4 duration-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
        {/* Icon */}
        <GitCompareArrows size={20} className="shrink-0 text-indigo-500" />

        {/* Product slots */}
        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {items.map((p) => (
            <div
              key={p.id}
              className="relative flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-white">
                <SafeImage src={p.imagePath} alt={p.name} placeholderIconSize={12} />
              </div>
              <span className="max-w-[100px] truncate text-xs font-semibold text-slate-700 sm:max-w-[140px]">
                {p.name}
              </span>
              <button
                onClick={() => remove(p.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-red-100 hover:text-red-500 transition-colors"
                title="Убрать из сравнения"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: 3 - items.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex h-[52px] w-[56px] shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-300"
            >
              —
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={clear}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Очистить
          </button>
          <Link
            href="/compare"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            Сравнить {items.length}
          </Link>
        </div>
      </div>
    </div>
  );
}
