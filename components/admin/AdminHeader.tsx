"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { Menu, X } from "lucide-react";

export function AdminHeader({ user }: { user: any }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [orderBadge, setOrderBadge] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/orders/count");
        if (res.ok) {
          const data = await res.json();
          setOrderBadge((data.pending ?? 0) + (data.consultation ?? 0));
        }
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (pathname === "/admin/login") {
    return null;
  }

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";

  return (
    <header className="border-b bg-white">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 font-semibold md:flex">
          <Link href="/admin">Главная</Link>
          {isAdminOrManager && (
            <>
              <Link href="/admin/customers">Клиенты</Link>
              <Link href="/admin/orders" className="relative">
                Заказы
                {orderBadge > 0 && (
                  <span className="absolute -right-3 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                    {orderBadge > 99 ? "99+" : orderBadge}
                  </span>
                )}
              </Link>
              <Link href="/admin/products">Товары</Link>
              <Link href="/admin/orders/export" className="text-indigo-600 hover:text-indigo-800">
                Выгрузка 1С
              </Link>
            </>
          )}
          {isAdmin && (
            <Link href="/admin/users">Пользователи</Link>
          )}
        </nav>

        {/* Mobile burger */}
        <button
          className="flex items-center md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold leading-tight">
              {user?.name || user?.email || "Администратор"}
            </div>
            <div className="text-xs text-gray-500">{user?.role || "admin"}</div>
          </div>
          <AdminLogoutButton />
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="flex flex-col border-t bg-white px-4 py-3 font-semibold md:hidden">
          <Link href="/admin" onClick={() => setMenuOpen(false)} className="py-2 border-b">Главная</Link>
          {isAdminOrManager && (
            <>
              <Link href="/admin/customers" onClick={() => setMenuOpen(false)} className="py-2 border-b">Клиенты</Link>
              <Link href="/admin/orders" onClick={() => setMenuOpen(false)} className="py-2 border-b flex items-center gap-2">
                Заказы
                {orderBadge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                    {orderBadge > 99 ? "99+" : orderBadge}
                  </span>
                )}
              </Link>
              <Link href="/admin/products" onClick={() => setMenuOpen(false)} className="py-2 border-b">Товары</Link>
              <Link href="/admin/orders/export" onClick={() => setMenuOpen(false)} className="py-2 border-b font-semibold text-indigo-600">Выгрузка 1С</Link>
            </>
          )}
          {isAdmin && (
            <Link href="/admin/users" onClick={() => setMenuOpen(false)} className="py-2">Пользователи</Link>
          )}
        </nav>
      )}
    </header>
  );
}
