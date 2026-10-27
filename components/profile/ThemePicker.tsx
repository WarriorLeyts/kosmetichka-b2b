"use client";

import { useEffect, useState } from "react";
import { readPref, setThemePref, type ThemePref } from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Как в системе" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/** Профиль → «Оформление»: like the app — follow the device or a fixed theme. */
export function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => setPref(readPref()), []);
  return (
    <div className="mb-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-slate-900">Оформление</h2>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Оформление">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={pref === o.value}
            onClick={() => {
              setThemePref(o.value);
              setPref(o.value);
            }}
            className={`rounded-xl border-2 px-2 py-2.5 text-sm font-bold transition ${pref === o.value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
