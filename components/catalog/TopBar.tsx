"use client";

import { Search, User, Heart, ShoppingBag, LayoutGrid, ClipboardList, X, ChevronRight, Bell, LogOut } from "lucide-react";
import { effectivePriceType, rawCartTotal } from "@/lib/pricing";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { Wordmark } from "@/components/app/Wordmark";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { categoryIcon, topLevelCategories, ALL_CATEGORIES_ICON } from "@/lib/categoryIcon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersNotifStore } from "@/store/ordersNotifStore";
import { useWishlistStore } from "@/store/wishlistStore";

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
  const loadWishlist = useWishlistStore((s) => s.load);
  const wishlistLoaded = useWishlistStore((s) => s.loaded);
  const wishlistProducts = useWishlistStore((s) => s.products);
  const syncFavoritesFromWishlist = useFavoriteStore((s) => s.syncFromWishlist);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // Load wishlist once the customer is known
  useEffect(() => {
    if (customer && !wishlistLoaded) {
      loadWishlist();
    }
  }, [customer, wishlistLoaded, loadWishlist]);

  // Sync cross-device favorites from server wishlist after load
  useEffect(() => {
    if (wishlistLoaded && wishlistProducts.length > 0) {
      syncFavoritesFromWishlist(wishlistProducts);
    }
  }, [wishlistLoaded, wishlistProducts, syncFavoritesFromWishlist]);

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

  // Build category tree (a single wrapper root like «Каталог» is skipped)
  const topLevel = topLevelCategories(categories);

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
    const icon = depth === 0 ? categoryIcon(cat.name) : null;

    return (
      <div key={cat.id}>
        <div className="app-cat-row">
          <button
            className={`app-cat-item${isActive ? " active" : ""}`}
            style={depth > 0 ? { paddingLeft: `${14 + depth * 14}px`, fontSize: 13, fontWeight: 500 } : undefined}
            onClick={() => handleSelect(cat.id)}
          >
            {depth === 0 && (icon ? <img src={icon} alt="" /> : <span style={{ width: 30, textAlign: "center" }}>✨</span>)}
            {cat.name}
          </button>
          {children.length > 0 && (
            <button
              className={`app-cat-toggle${isExpanded ? " expanded" : ""}`}
              onClick={() => setExpandedGuid(isExpanded ? null : cat.guid)}
              aria-label={isExpanded ? "Свернуть" : "Развернуть"}
            >
              <ChevronRight size={16} />
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
        className={`app-cat-item${!categoryId ? " active" : ""}`}
        onClick={() => handleSelect(null)}
      >
        <img src={ALL_CATEGORIES_ICON} alt="" />
        Все товары
      </button>
      {topLevel.map((cat) => renderItem(cat))}
    </>
  );

  const catalogButton = onCategorySelect ? (
    <div className="app-cat-wrap">
      <button ref={catBtnRef} type="button" className="app-catalog-btn" onClick={() => setCatOpen((v) => !v)} aria-label="Категории">
        <LayoutGrid size={19} />
        <span className="app-catalog-btn__text">Каталог</span>
      </button>
      {/* Desktop dropdown (hidden on phones via CSS) */}
      <div className={`app-cat-dropdown${catOpen ? " open" : ""}`} ref={catPanelRef}>
        {categoryList}
      </div>
    </div>
  ) : (
    <Link href="/catalog" className="app-catalog-btn" aria-label="Каталог">
      <LayoutGrid size={19} />
      <span className="app-catalog-btn__text">Каталог</span>
    </Link>
  );

  return (
    <>
      <header className="app-header">
        <div className="app-header__left">
          <ThemeToggle />
          {catalogButton}
        </div>

        <Link href="/" className="app-header__brand" title="На главную">
          <Wordmark size={19} />
          <span className="app-header__subtitle">Сеть магазинов косметики и парфюмерии</span>
        </Link>

        <form
          className="app-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(search.trim() ? `/catalog?search=${encodeURIComponent(search.trim())}` : "/catalog");
          }}
        >
          <label className="app-search__field">
            <Search size={20} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, бренд, артикул" aria-label="Поиск" />
          </label>
          <button type="submit" className="app-search__go" aria-label="Найти">
            <Search size={22} />
          </button>
        </form>

        <div className="app-header__actions">
          {loading ? (
            <div className="app-glass hide-mobile" style={{ opacity: 0.5 }} />
          ) : customer ? (
            <div className="app-account hide-mobile" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="app-account__btn" aria-label="Аккаунт">
                <span className="app-account__avatar">{customer.name?.charAt(0).toUpperCase()}</span>
                <span className="app-account__name">{customer.name}</span>
                {totalBadge > 0 && <span className="app-badge">{totalBadge}</span>}
              </button>
              {menuOpen && (
                <div className="app-menu">
                  <div className="app-menu__head">
                    <b>{customer.name}</b>
                    <span>{customer.email}</span>
                  </div>
                  <Link href="/profile" onClick={() => setMenuOpen(false)}>
                    <User size={17} /> Профиль
                  </Link>
                  <Link href="/orders" onClick={() => setMenuOpen(false)}>
                    <ClipboardList size={17} /> Мои заказы
                    {totalBadge > 0 && <span className="app-badge" style={{ marginLeft: "auto" }}>{totalBadge}</span>}
                  </Link>
                  <Link href="/wishlist" onClick={() => setMenuOpen(false)}>
                    <Bell size={17} /> Лист ожидания
                  </Link>
                  <button onClick={logout} className="app-menu__danger">
                    <LogOut size={17} /> Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="app-glass hide-mobile" aria-label="Войти" title="Войти">
              <User size={20} />
            </Link>
          )}

          <button className="app-glass" onClick={openFavorite} aria-label="Избранное" title="Избранное">
            <Heart size={20} />
            {mounted && favoriteCount > 0 && <span className="app-badge">{favoriteCount > 99 ? "99+" : favoriteCount}</span>}
          </button>

          <button className="app-glass" onClick={openCart} aria-label="Корзина" title="Корзина">
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span key={cartCount} className="app-badge badge-bump">{cartCount > 99 ? "99+" : cartCount}</span>
            )}
          </button>
          {mounted && cartCount > 0 && (
            <span className="app-cart-total" onClick={openCart}>
              {cartTotal.toLocaleString("ru-RU")} ₽
            </span>
          )}
        </div>
      </header>

      {/* Phone: bottom sheet with categories (hidden on desktop via CSS) */}
      {onCategorySelect && (
        <>
          <div
            className={`app-cat-backdrop${catOpen ? " open" : ""}`}
            onClick={() => { setCatOpen(false); setExpandedGuid(null); }}
          />
          <div className={`app-cat-drawer${catOpen ? " open" : ""}`} role="dialog" aria-label="Категории">
            <div className="app-cat-drawer__grip" />
            <div className="app-cat-drawer__head">
              <b>Категории</b>
              <button className="app-glass" style={{ width: 36, height: 36 }} onClick={() => { setCatOpen(false); setExpandedGuid(null); }} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            {categoryList}
          </div>
        </>
      )}
    </>
  );
}
