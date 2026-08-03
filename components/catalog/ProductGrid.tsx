import { ProductCard } from "./ProductCard";

type Variant = { id: number; imageUrl: string; name: string };

type Props = {
  products: any[];
  addToCart: (product: any) => void;
  onOpenPicker: (product: any, variants: Variant[]) => void;
};

export function ProductGrid({ products, addToCart, onOpenPicker }: Props) {
  if (products.length === 0) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm font-semibold text-slate-400">
        Товары не найдены
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          addToCart={addToCart}
          onOpenPicker={onOpenPicker}
        />
      ))}
    </div>
  );
}
