"use client";

import { Search, User, Heart, ShoppingCart, Menu, ClipboardList, X, ChevronRight } from "lucide-react";
import { effectivePriceType, rawCartTotal } from "@/lib/pricing";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { Button } from "../ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersNotifStore } from "@/store/ordersNotifStore";

type Category = {
  id: number;
  guid: string;
  name: string;
  parentGuid?: string | null;
};

type TopBarProps = {
  search: string;
  setSearch: (value: string) => void;
  categories?: Category[];
  categoryId?: number | null;
  onCategorySelect?: (id: number | null) => void;
};

export function TopBar({
  search,
  setSearch,
  categories = [],
  categoryId,
  onCategorySelect,
}: TopBarProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const cart = useCartStore((s) => s.cart);
  const openCart = useCartStore((s) => s.openCart);
  const openFavorite = useFavoriteStore((s) => s.openFavorite);
  const favoriteCount = useFavoriteStore((s) => s.favorites.length);
  const customer = useAuthStore((s) => s.customer);
  const loading = useAuthStore((s) => s.loading);
  const fetchCustomer = useAuthStore((s) => s.fetchCustomer);
  const logout = useAuthStore((s) => s.logout);
  const pendingCount = useOrdersNotifStore((s) => s.pendingCount);
  const newMessageOrderIds = useOrdersNotifStore((s) => s.newMessageOrderIds);
  const totalBadge = pendingCount + newMessageOrderIds.length;

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // Account dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Category menu
  const [catOpen, setCatOpen] = useState(false);
  const [expandedGuid, setExpandedGuid] = useState<string | null>(null);
  const catPanelRef = useRef<HTMLDivElement>(null);
  const catBtnRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll on mobile when drawer is open
  useEffect(() => {
    const isMobile = window.innerWidth <= 900;
    if (catOpen && isMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [catOpen]);

  // Close cat menu on outside click (desktop)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        catPanelRef.current && !catPanelRef.current.contains(e.target as Node) &&
        catBtnRef.current && !catBtnRef.current.contains(e.target as Node)
      ) {
        setCatOpen(false);
      }
    }
    if (catOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catOpen]);

  // Build category tree
  const roots = categories.filter((c) => !c.parentGuid);
  // If there's a single root wrapper (e.g. "Каталог"), skip it and show its children
  const topLevel =
    roots.length === 1
      ? categories.filter((c) => c.parentGuid === roots[0].guid)
      : roots;

  function getChildren(guid: string) {
    return categories.filter((c) => c.parentGuid === guid);
  }

  function handleSelect(id: number | null) {
    onCategorySelect?.(id);
    setCatOpen(false);
    setExpandedGuid(null);
  }

  function renderItem(cat: Category, depth = 0): React.ReactNode {
    const children = getChildren(cat.guid);
    const isExpanded = expandedGuid === cat.guid;
    const isActive = categoryId === cat.id || children.some((c) => c.id === categoryId);

    return (
      <div key={cat.id}>
        <div className="cat-item-row">
          <button
            className={`cat-menu-item${isActive ? " active" : ""}`}
            style={depth > 0 ? { paddingLeft: `${14 + depth * 10}px`, fontSize: 13 } : undefined}
            onClick={() => handleSelect(cat.id)}
          >
            {cat.name}
          </button>
          {children.length > 0 && (
            <button
              className={`cat-item-toggle${isExpanded ? " expanded" : ""}`}
              onClick={() => setExpandedGuid(isExpanded ? null : cat.guid)}
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
        {isExpanded && children.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  }

  const cartCount = mounted ? cart.reduce((s, i) => s + i.quantity, 0) : 0;
  const cartTotal = mounted ? rawCartTotal(cart, effectivePriceType(cart, customer)) : 0;

  const categoryList = (
    <>
      <button
        className={`cat-menu-item${!categoryId ? " active" : ""}`}
        onClick={() => handleSelect(null)}
      >
        Все товары
      </button>
      {topLevel.map((cat) => renderItem(cat))}
    </>
  );

  return (
    <>
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

        {/* Catalog button */}
        {onCategorySelect ? (
          <div style={{ position: "relative", flexShrink: 0, order: -1 }}>
            <button
              ref={catBtnRef}
              type="button"
              className="catalog-button"
              onClick={() => setCatOpen((v) => !v)}
            >
              <Menu size={18} />
              <span className="catalog-button-text">Каталог</span>
            </button>

            {/* Desktop dropdown (shown via CSS on ≥901px) */}
            <div className={`cat-desktop-dropdown${catOpen ? " open" : ""}`} ref={catPanelRef}>
              <div className="cat-menu-body">{categoryList}</div>
            </div>
          </div>
        ) : (
          <Link href="/catalog" className="catalog-button">
            <Menu size={18} />
            <span className="catalog-button-text">Каталог</span>
          </Link>
        )}

        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(search.trim() ? `/catalog?search=${encodeURIComponent(search.trim())}` : "/catalog");
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по товарам..." />
          <Button type="submit" className="w-16 h-full flex items-center justify-center rounded-l-none">
            <Search className="h-5 w-5" />
          </Button>
        </form>

        <div className="top-actions">
          {loading ? (
            <div className="h-10 w-32 animate-pulse rounded-2xl bg-slate-100" />
          ) : customer ? (
            <div className="relative" ref={menuRef}>
              <div className="topbar-avatar-wrap">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 font-bold text-slate-800 transition hover:bg-slate-50 hover:text-pink-500"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white">
                    {customer.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="topbar-customer-name">{customer.name}</span>
                </button>
                {totalBadge > 0 && <span className="topbar-pending-badge">{totalBadge}</span>}
              </div>

              {menuOpen && (
                <div className="absolute right-0 md:right-auto md:left-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="mb-3 border-b border-slate-100 pb-3">
                    <div className="font-black text-slate-800">{customer.name}</div>
                    <div className="text-xs font-semibold text-slate-400">{customer.email}</div>
                  </div>
                  <Link href="/orders" onClick={() => setMenuOpen(false)} className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-pink-500">
                    <ClipboardList size={16} />
                    Мои заказы
                    {totalBadge > 0 && <span className="topbar-menu-badge">{totalBadge}</span>}
                  </Link>
                  <button onClick={logout} className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50">
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
            <div className="relative">
              <Heart size={18} />
              {favoriteCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] font-black text-white">
                  {favoriteCount > 99 ? "99+" : favoriteCount}
                </span>
              )}
            </div>
            <span className="top-action-label">Избранное</span>
          </button>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button className="top-action-button" onClick={openCart}>
              <div className="relative">
                <ShoppingCart size={18} />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] font-black text-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </div>
              <span className="top-action-label">Корзина</span>
            </button>
            {mounted && cartCount > 0 && (
              <span className="cart-action-total" onClick={openCart}>
                {cartTotal.toLocaleString("ru-RU")} ₽
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer (hidden on desktop via CSS) */}
      {onCategorySelect && (
        <>
          <div
            className={`cat-mobile-backdrop${catOpen ? " open" : ""}`}
            onClick={() => { setCatOpen(false); setExpandedGuid(null); }}
          />
          <div className={`cat-mobile-drawer${catOpen ? " open" : ""}`}>
            <div className="cat-menu-header">
              <span style={{ fontSize: 17, fontWeight: 900, color: "#1f2937" }}>Категории</span>
              <button
                onClick={() => { setCatOpen(false); setExpandedGuid(null); }}
                style={{ width: 34, height: 34, borderRadius: 12, background: "#f8fafc", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b" }}
              >
                <X size={17} />
              </button>
            </div>
            <div className="cat-menu-body">{categoryList}</div>
          </div>
        </>
      )}
    </>
  );
}
