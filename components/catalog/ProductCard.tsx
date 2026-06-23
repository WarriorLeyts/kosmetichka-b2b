"use client";

import { Heart, ShoppingCart } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SafeImage } from "./SafeImage";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";
import { resolveImageUrl } from "@/lib/image";

type Props = {
  product: any;
  addToCart: (product: any) => void;
};

export function ProductCard({ product, addToCart }: Props) {
  const imagePath = product.images?.[0]?.path
    ? resolveImageUrl(product.images[0].path)
    : null;

  const toggleFavorite = useFavoriteStore((state) => state.toggleFavorite);

  const isFavorite = useFavoriteStore((state) =>
    state.favorites.some((item) => item.id === product.id)
  );
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const mainLabel = priceTypeLabel(priceType);

  return (
    <article
      className="product-card cursor-pointer"
      onClick={() => router.push(`/product/${product.id}`)}
    >
      <div className="product-image-box">
        <SafeImage
          src={imagePath}
          alt={product.name}
          placeholderIconSize={18}
        />
      </div>

      <Link href={`/product/${product.id}`} onClick={(e) => e.stopPropagation()}>
        <h2>{product.name}</h2>
      </Link>

      <div className="product-meta">
        <span className="truncate">
          {product.category?.name || product.barcode || "—"}
        </span>

        <strong className={stock.className}>{stock.text}</strong>
      </div>

      {customer && (
        <div className="price-row">
          <span>Розница:</span>
          <b>{product.retailPrice ?? 0} ₽</b>
        </div>
      )}

      <div className="price-row">
        <span>{customer ? mainLabel + ":" : "Цена:"}</span>
        <b className={customer ? "accent-price" : ""}>{mainPrice} ₽</b>
      </div>

      <div className="card-actions">
        <button
          className="cart-button"
          onClick={(e) => {
            e.stopPropagation();
            addToCart(product);
          }}
        >
          <ShoppingCart size={15} />В корзину
        </button>

        <button
          className={`favorite-button ${isFavorite ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product);
          }}
        >
          <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}
