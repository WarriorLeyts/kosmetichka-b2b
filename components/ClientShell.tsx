"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { CartDrawer } from "@/components/catalog/CartDrawer";
import { FavoriteDrawer } from "@/components/catalog/FavoriteDrawer";
import { CartToast } from "@/components/catalog/CartToast";
import { OrderNotifications } from "@/components/orders/OrderNotifications";
import { CompareBar } from "@/components/compare/CompareBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CookieBanner } from "@/components/CookieBanner";
import { Toaster } from "sonner";

export function ClientShell() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  // Тесты для сотрудников (/academy) — без магазинной обвязки: корзины, уведомлений, cookie-баннера
  if (pathname?.startsWith("/academy")) return null;
  // админ-панель (admin.kosmetichka-opt.ru, lib/themeScript.ts ставит data-cms) — тоже без магазинной обвязки
  if (mounted && document.documentElement.dataset.cms === "1") return null;
  // нижнее меню и баннер cookie рендерятся сразу (в HTML), остальное — после монтирования
  if (!mounted)
    return (
      <>
        <MobileBottomNav key="nav" />
        <CookieBanner key="cookie" />
      </>
    );

  return (
    <>
      <CartDrawer />
      <FavoriteDrawer />
      <CartToast />
      <OrderNotifications />
      <CompareBar />
      <MobileBottomNav key="nav" />
      <CookieBanner key="cookie" />
      <Toaster position="top-center" richColors />
    </>
  );
}
