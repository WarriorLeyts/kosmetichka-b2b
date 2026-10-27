"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";

export { THEME_KEY };
export type ThemeMode = "light" | "dark";
/** «Как в системе» / «Светлая» / «Тёмная» — as Профиль → «Оформление» in the app */
export type ThemePref = "system" | "light" | "dark";

function read(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function systemMode(): ThemeMode {
  return typeof window.matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readPref(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice and applies it at once ("system" = follow the device, also when it changes). */
export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  document.documentElement.dataset.theme = pref === "system" ? systemMode() : pref;
}

/** Текущая тема (атрибут data-theme на <html>, его ставит THEME_INIT_SCRIPT до отрисовки) и переключатель. */
export function useThemeMode() {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, read, () => "light");
  // «как в системе»: follow the device when it switches light/dark while the page is open
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      if (readPref() === "system" && !document.documentElement.dataset.area) document.documentElement.dataset.theme = systemMode();
    };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const toggle = useCallback(() => {
    setThemePref(read() === "dark" ? "light" : "dark");
  }, []);
  return { mode, toggle };
}
