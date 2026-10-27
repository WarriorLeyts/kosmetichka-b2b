"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, FileText, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

const HIDDEN_PREFIXES = ["/admin", "/picker", "/login", "/register", "/forgot-password", "/reset-password", "/academy"];

/** Нижнее меню на телефоне — как TabBar приложения: плавающая полупрозрачная панель, активная вкладка — фиолетовая капсула. */
export function MobileBottomNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const rawCartCount = useCartStore((s) => s.cart.reduce((sum, i) => sum + i.quantity, 0));
  const openCart = useCartStore((s) => s.openCart);
  const cartOpen = useCartStore((s) => s.isCartOpen);

  useEffect(() => { setMounted(true); }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const cartCount = mounted ? rawCartCount : 0;
  const is = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  const tab = (href: string, label: string, Icon: typeof Home) => {
    const active = !cartOpen && is(href);
    return (
      <Link key={href} href={href} className={`mobile-bottom-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
        <Icon size={24} strokeWidth={active ? 2.3 : 1.9} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Навигация">
      {tab("/", "Главная", Home)}
      {tab("/catalog", "Каталог", LayoutGrid)}
      <button type="button" className={`mobile-bottom-nav-item${cartOpen ? " active" : ""}`} onClick={openCart} aria-label="Корзина">
        <span className="relative inline-flex items-center justify-center">
          <ShoppingBag size={24} strokeWidth={cartOpen ? 2.3 : 1.9} />
          {cartCount > 0 && <span className="mobile-bottom-nav-badge">{cartCount > 99 ? "99+" : cartCount}</span>}
        </span>
        <span>Корзина</span>
      </button>
      {tab("/orders", "Заказы", FileText)}
      {tab("/profile", "Профиль", User)}
    </nav>
  );
}
