"use client";

import { Moon, Sun } from "lucide-react";
import { useThemeMode } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, toggle } = useThemeMode();
  const dark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`app-glass ${className}`}
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
