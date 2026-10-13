"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Grid2x2, ClipboardList, User, Heart } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

const NAV_ITEMS = [
  { href: "/catalog", label: "Каталог", Icon: Grid2x2 },
  { href: "/orders", label: "Заказы", Icon: ClipboardList },
  { href: "/wishlist", label: "Ожидание", Icon: Heart },
  { href: "/profile", label: "Профиль", Icon: User },
];

const HIDDEN_PREFIXES = ["/admin", "/picker", "/login", "/register", "/forgot-password", "/reset-password"];

export function MobileBottomNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const rawCartCount = useCartStore((s) => s.cart.reduce((sum, i) => sum + i.quantity, 0));
  const openCart = useCartStore((s) => s.openCart);

  useEffect(() => { setMounted(true); }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const cartCount = mounted ? rawCartCount : 0;

  return (
    <nav className="mobile-bottom-nav">
      <button
        type="button"
        className="mobile-bottom-nav-item"
        onClick={openCart}
        aria-label="Корзина"
      >
        <span className="relative inline-flex items-center justify-center">
          <ShoppingBag size={24} />
          {cartCount > 0 && (
            <span className="mobile-bottom-nav-badge">{cartCount > 99 ? "99+" : cartCount}</span>
          )}
        </span>
        <span>Корзина</span>
      </button>

      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} className={`mobile-bottom-nav-item${active ? " active" : ""}`}>
            <Icon size={24} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
