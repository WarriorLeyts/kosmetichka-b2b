"use client";

import { RotateCcw } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

type OrderItem = {
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  imagePath: string | null;
};

export function RepeatOrderButton({ items }: { items: OrderItem[] }) {
  const setCart = useCartStore((state) => state.setCart);

  function repeatOrder() {
    // Drop the old items into the cart so the customer can tweak
    // quantities or remove things before submitting again — actual
    // pricing is always recalculated server-side at checkout, this is
    // just for display while editing. OrderItem doesn't store the
    // product photo, so the page looked it up by productId for us.
    setCart(
      items.map((item) => ({
        id: item.productId,
        name: item.productName,
        barcode: item.barcode,
        // Заполняем все варианты цены чтобы корзина показывала правильно
        // независимо от типа цен клиента
        wholesalePrice: item.price,
        bigWholesalePrice: item.price,
        retailPrice: item.price,
        discountPrice: item.price,
        quantity: item.quantity,
        images: item.imagePath ? [{ path: item.imagePath }] : [],
      }))
    );
  }

  return (
    <button type="button" className="order-repeat-button" onClick={repeatOrder}>
      <RotateCcw size={15} />
      Повторить и отредактировать
    </button>
  );
}
