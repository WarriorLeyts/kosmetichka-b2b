"use client";

import Link from "next/link";
import { ChevronLeft, User } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

/** Верхняя панель внутренних страниц — как BackBar приложения: «назад» слева, «КОСМЕТИЧКА» по центру, тема справа. */
export function AppBar({ backHref = "/catalog", profile = false }: { backHref?: string; profile?: boolean }) {
  return (
    <nav className="app-bar" aria-label="Навигация">
      <Link href={backHref} className="app-bar__back" aria-label="Назад">
        <ChevronLeft size={28} />
      </Link>
      <Link href="/" className="app-bar__brand" title="На главную">
        <Wordmark size={19} />
      </Link>
      <div className="app-bar__right">
        {profile && (
          <Link href="/profile" className="app-glass hide-mobile" aria-label="Профиль" title="Профиль">
            <User size={20} />
          </Link>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}
