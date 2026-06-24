"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminLogoutButton } from "./AdminLogoutButton";

export function AdminHeader({ user }: { user: any }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return null;
  }

  return (
    <header className="border-b bg-white">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex gap-6 font-semibold">
  <Link href="/admin">Главная</Link>

  {(user?.role === "admin" || user?.role === "manager") && (
    <>
      <Link href="/admin/customers">Клиенты</Link>
      <Link href="/admin/orders">Заказы</Link>
      <Link href="/admin/import">Импорт</Link>
    </>
  )}

  {user?.role === "admin" && (
    <Link href="/admin/users">Пользователи</Link>
  )}
</div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-bold">
              {user?.name || user?.email || "Администратор"}
            </div>
            <div className="text-xs text-gray-500">
              {user?.role || "admin"}
            </div>
          </div>

          <AdminLogoutButton />
        </div>
      </div>
    </header>
  );
}