"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { History, Home, Image as ImageIcon, LayoutDashboard, LogOut, Menu, Package, ShoppingBag, Settings, LayoutGrid, FileText, BadgePercent, Search, Upload, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE: Record<string, string> = { admin: "Администратор", manager: "Менеджер" };

/** Боковое меню панели — только разделы, которые уже работают */
export function CmsSidebar({ user, canAudit }: { user: { name: string; role: string }; canAudit: boolean }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  // адреса без /cms (proxy.ts), но на сервере usePathname может вернуть /cms/... — убираем префикс
  const cur = path.replace(/^\/cms(?=\/|$)/, "") || "/";
  const items = [
    { href: "/", label: "Дашборд", icon: LayoutDashboard },
    { href: "/home", label: "Главная страница", icon: Home },
    { href: "/catalog", label: "Каталог", icon: LayoutGrid },
    { href: "/pages", label: "Страницы", icon: FileText },
    { href: "/banners", label: "Баннеры", icon: ImageIcon },
    { href: "/promo", label: "Акция", icon: BadgePercent },
    { href: "/products", label: "Товары", icon: Package },
    { href: "/products/images", label: "Загрузка фото", icon: Upload },
    { href: "/seo", label: "Массовое SEO", icon: Search },
    { href: "/orders", label: "Заказы", icon: ShoppingBag },
    { href: "/settings", label: "Настройки", icon: Settings },
    ...(canAudit ? [{ href: "/history", label: "Журнал действий", icon: History }] : []),
  ];
  const active = (href: string) => (href === "/" ? cur === "/" : cur === href || (cur.startsWith(href + "/") && !items.some((i) => i.href !== href && i.href.startsWith(href) && cur.startsWith(i.href))));

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <div className="text-[15px] font-bold tracking-wide text-[#8E1B47]">КОСМЕТИЧКА</div>
        <div className="text-xs text-neutral-500">Админ-панель сайта</div>
      </div>
      <div className="flex-1 space-y-0.5 px-3">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active(href) ? "bg-[#FBEFF3] font-medium text-[#8E1B47]" : "text-neutral-700 hover:bg-neutral-100"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
        <a href="https://kosmetichka-opt.ru/admin/" className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
          <ExternalLink className="size-4" />
          Покупатели и сборка (Team)
        </a>
      </div>
      <div className="border-t border-neutral-200 px-5 py-4">
        <div className="truncate text-sm font-medium text-neutral-800">{user.name}</div>
        <div className="text-xs text-neutral-500">{ROLE[user.role] ?? user.role}</div>
        <form action="/api/cms/logout" method="post" className="mt-2">
          <button className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-[#8E1B47]">
            <LogOut className="size-3.5" /> Выйти
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-neutral-200 bg-white md:block">{nav}</aside>
      <button
        className="fixed left-3 top-3 z-[95] rounded-lg border border-neutral-200 bg-white p-2 shadow-sm md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Меню"
      >
        <Menu className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[150] md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-3 top-4" onClick={() => setOpen(false)} aria-label="Закрыть">
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
