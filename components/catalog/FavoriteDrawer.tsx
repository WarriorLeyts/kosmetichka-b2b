"use client";

import { Heart, ShoppingCart, Trash2, X } from "lucide-react";
import { resolveImageUrl } from "@/lib/image";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { SafeImage } from "./SafeImage";
import { resolveCustomerPriceType, priceFor } from "@/lib/pricing";

export function FavoriteDrawer() {
  const favorites = useFavoriteStore((state) => state.favorites);
  const isFavoriteOpen = useFavoriteStore((state) => state.isFavoriteOpen);
  const closeFavorite = useFavoriteStore((state) => state.closeFavorite);
  const removeFavorite = useFavoriteStore((state) => state.removeFavorite);

  const addToCart = useCartStore((state) => state.addToCart);
  const customer = useAuthStore((state) => state.customer);
  const customerPriceType = resolveCustomerPriceType(customer);

  if (!isFavoriteOpen) return null;

  return (
    <div className="cart-overlay" onClick={closeFavorite}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <div>
            <h2>Избранное</h2>
            <p>{favorites.length} товаров</p>
          </div>

          <button
            className="cart-close flex h-11 w-11 items-center justify-center rounded-xl"
            onClick={closeFavorite}
          >
            <X size={20} />
          </button>
        </div>

        {favorites.length === 0 ? (
          <div className="cart-empty">
            <Heart size={40} />
            <p>Избранное пустое</p>
          </div>
        ) : (
          <div className="cart-list">
            {favorites.map((item) => {
              const imagePath = item.images?.[0]?.path
                ? resolveImageUrl(item.images[0].path)
                : null;

              return (
                <div className="cart-item" key={item.id}>
                  <div className="cart-item-image">
                    <SafeImage
                      src={imagePath}
                      alt={item.name}
                      placeholderText="Фото"
                      placeholderIconSize={16}
                    />
                  </div>

                  <div className="cart-item-info">
                    <h3>{item.name}</h3>
                    <p>{priceFor(item, customerPriceType).toLocaleString("ru-RU")} ₽</p>

                    <div className="favorite-item-actions">
                      <button
                        className="favorite-add-to-cart"
                        onClick={() => addToCart(item)}
                      >
                        <ShoppingCart size={14} />В корзину
                      </button>

                      <button
                        className="cart-remove flex h-11 w-11 items-center justify-center rounded-xl"
                        onClick={() => removeFavorite(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
