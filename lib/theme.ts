"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";

export { THEME_KEY };
export type ThemeMode = "light" | "dark";

function read(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** Текущая тема (атрибут data-theme на <html>, его ставит THEME_INIT_SCRIPT до отрисовки) и переключатель. */
export function useThemeMode() {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, read, () => "light");
  const toggle = useCallback(() => {
    const next: ThemeMode = read() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }, []);
  return { mode, toggle };
}
