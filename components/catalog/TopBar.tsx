"use client";

import { Search, User, Heart, ShoppingCart, Menu, ClipboardList } from "lucide-react";
import { effectivePriceType, rawCartTotal } from "@/lib/pricing";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { Button } from "../ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersNotifStore } from "@/store/ordersNotifStore";

type TopBarProps = {
  search: string;
  setSearch: (value: string) => void;
};

export function TopBar({ search, setSearch }: TopBarProps) {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cart = useCartStore((state) => state.cart);
  const openCart = useCartStore((state) => state.openCart);
  const openFavorite = useFavoriteStore((state) => state.openFavorite);
  const favoriteCount = useFavoriteStore((state) => state.favorites.length);

  const customer = useAuthStore((state) => state.customer);
  const loading = useAuthStore((state) => state.loading);
  const fetchCustomer = useAuthStore((state) => state.fetchCustomer);
  const logout = useAuthStore((state) => state.logout);

  const pendingCount = useOrdersNotifStore((state) => state.pendingCount);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const cartCount = mounted
    ? cart.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  const cartTotal = mounted
    ? rawCartTotal(cart, effectivePriceType(cart, customer))
    : 0;

  return (
    <header className="topbar">
      <div className="brand-logo">
        <div className="heart-logo">♡</div>

        <div>
          <div className="brand-name">Косметичка</div>
          <div className="brand-subtitle-text bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xs font-semibold text-transparent">
            сеть магазинов косметики и парфюмерии
          </div>
        </div>
      </div>

      <Link href="/catalog" className="catalog-button">
        <Menu size={18} />
        <span className="catalog-button-text">Каталог</span>
      </Link>

      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(
            search.trim()
              ? `/catalog?search=${encodeURIComponent(search.trim())}`
              : "/catalog"
          );
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по товарам..."
        />

        <Button
          type="submit"
          className="w-16 h-full flex items-center justify-center rounded-l-none"
        >
          <Search className="h-5 w-5" />
        </Button>
      </form>

      <div className="top-actions">
        {loading ? (
          <div className="h-10 w-32 animate-pulse rounded-2xl bg-slate-100" />
        ) : customer ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 font-bold text-slate-800 transition hover:bg-slate-50 hover:text-pink-500"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white">
                {customer.name?.charAt(0).toUpperCase()}
              </div>

              <span className="topbar-customer-name">{customer.name}</span>

              {pendingCount > 0 && (
                <span className="topbar-pending-badge">{pendingCount}</span>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 md:right-auto md:left-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="mb-3 border-b border-slate-100 pb-3">
                  <div className="font-black text-slate-800">
                    {customer.name}
                  </div>
                  <div className="text-xs font-semibold text-slate-400">
                    {customer.email}
                  </div>
                </div>

                <Link
                  href="/orders"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-pink-500"
                >
                  <ClipboardList size={16} />
                  Мои заказы
                  {pendingCount > 0 && (
                    <span className="topbar-menu-badge">{pendingCount}</span>
                  )}
                </Link>

                <button
                  onClick={logout}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="top-action-button">
            <User size={18} />
            <span className="top-action-label">Войти</span>
          </Link>
        )}

        <button className="top-action-button" onClick={openFavorite}>
          <Heart size={18} />
          <span className="top-action-label">
            Избранное {favoriteCount > 0 && `(${favoriteCount})`}
          </span>
        </button>

        <button className="top-action-button cart-action-button" onClick={openCart}>
          <ShoppingCart size={18} />
          <span className="top-action-label">
            Корзина {cartCount > 0 && `(${cartCount})`}
          </span>
          {cartCount > 0 && (
            <span className="cart-action-total">
              {cartTotal.toLocaleString("ru-RU")} ₽
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
