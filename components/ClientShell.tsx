"use client";
import { useState, useEffect } from "react";
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
  if (!mounted) return null;

  return (
    <>
      <CartDrawer />
      <FavoriteDrawer />
      <CartToast />
      <OrderNotifications />
      <CompareBar />
      <MobileBottomNav />
      <CookieBanner />
      <Toaster position="top-center" richColors />
    </>
  );
}
