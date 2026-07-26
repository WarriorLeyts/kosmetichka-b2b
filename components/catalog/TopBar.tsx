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

export function TopBar({ search, setSearch, categories = [], categoryId, onCategorySelect }: TopBarProps) {
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
  const newMessageOrderIds = useOrdersNotifStore((state) => state.newMessageOrderIds);
  const totalBadge = pendingCount + newMessageOrderIds.length;

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  // User account dropdown
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

  // Category drawer
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [expandedGuid, setExpandedGuid] = useState<string | null>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (catMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [catMenuOpen]);

  const topLevel = categories.filter((c) => !c.parentGuid);

  function getChildren(parentGuid: string) {
    return categories.filter((c) => c.parentGuid === parentGuid);
  }

  function handleSelectCategory(id: number | null) {
    onCategorySelect?.(id);
    setCatMenuOpen(false);
    setExpandedGuid(null);
  }

  const cartCount = mounted
    ? cart.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  const cartTotal = mounted
    ? rawCartTotal(cart, effectivePriceType(cart, customer))
    : 0;

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

        {onCategorySelect ? (
          <button
            type="button"
            className="catalog-button"
            onClick={() => setCatMenuOpen(true)}
          >
            <Menu size={18} />
            <span className="catalog-button-text">Каталог</span>
          </button>
        ) : (
          <Link href="/catalog" className="catalog-button">
            <Menu size={18} />
            <span className="catalog-button-text">Каталог</span>
          </Link>
        )}

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
                {totalBadge > 0 && (
                  <span className="topbar-pending-badge">{totalBadge}</span>
                )}
              </div>

              {menuOpen && (
                <div className="absolute right-0 md:right-auto md:left-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="mb-3 border-b border-slate-100 pb-3">
                    <div className="font-black text-slate-800">{customer.name}</div>
                    <div className="text-xs font-semibold text-slate-400">{customer.email}</div>
                  </div>

                  <Link
                    href="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-pink-500"
                  >
                    <ClipboardList size={16} />
                    Мои заказы
                    {totalBadge > 0 && (
                      <span className="topbar-menu-badge">{totalBadge}</span>
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

      {/* ── Category drawer ───────────────────────────────────────────────── */}
      {onCategorySelect && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setCatMenuOpen(false); setExpandedGuid(null); }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.45)",
              opacity: catMenuOpen ? 1 : 0,
              pointerEvents: catMenuOpen ? "auto" : "none",
              transition: "opacity 0.25s",
            }}
          />

          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              height: "100%",
              width: "min(320px, 85vw)",
              background: "#fff",
              zIndex: 101,
              display: "flex",
              flexDirection: "column",
              transform: catMenuOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.28s cubic-bezier(.4,0,.2,1)",
              boxShadow: "4px 0 32px rgba(0,0,0,0.13)",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 20px 16px",
              borderBottom: "1px solid #f1f5f9",
            }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#1f2937" }}>Категории</span>
              <button
                onClick={() => { setCatMenuOpen(false); setExpandedGuid(null); }}
                style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: "#f8fafc", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#64748b",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Category list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 24px" }}>
              {/* Все товары */}
              <button
                onClick={() => handleSelectCategory(null)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 14,
                  marginBottom: 2,
                  background: categoryId === null ? "linear-gradient(135deg,#fdf2f8,#f5f3ff)" : "transparent",
                  color: categoryId === null ? "#e82c87" : "#374151",
                }}
              >
                Все товары
              </button>

              {topLevel.map((cat) => {
                const children = getChildren(cat.guid);
                const isExpanded = expandedGuid === cat.guid;
                const isActive = categoryId === cat.id || children.some((c) => c.id === categoryId);

                return (
                  <div key={cat.id}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                      <button
                        onClick={() => handleSelectCategory(cat.id)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          padding: "10px 14px",
                          borderRadius: children.length ? "14px 0 0 14px" : 14,
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 14,
                          background: isActive ? "linear-gradient(135deg,#fdf2f8,#f5f3ff)" : "transparent",
                          color: isActive ? "#e82c87" : "#374151",
                        }}
                      >
                        {cat.name}
                      </button>
                      {children.length > 0 && (
                        <button
                          onClick={() => setExpandedGuid(isExpanded ? null : cat.guid)}
                          style={{
                            width: 36, height: 36,
                            borderRadius: "0 14px 14px 0",
                            border: "none",
                            cursor: "pointer",
                            background: isActive ? "linear-gradient(135deg,#fdf2f8,#f5f3ff)" : "transparent",
                            color: isActive ? "#e82c87" : "#94a3b8",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                            transition: "transform 0.2s",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </div>

                    {/* Subcategories */}
                    {isExpanded && children.length > 0 && (
                      <div style={{ marginLeft: 16, marginBottom: 4 }}>
                        {children.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => handleSelectCategory(child.id)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 14px",
                              borderRadius: 12,
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                              marginBottom: 2,
                              background: categoryId === child.id ? "linear-gradient(135deg,#fdf2f8,#f5f3ff)" : "transparent",
                              color: categoryId === child.id ? "#e82c87" : "#4b5563",
                            }}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
