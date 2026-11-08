import type { WarehouseQty } from "@/lib/warehouseStock";

/**
 * Staff only: stock per 1C warehouse under the total («Склад Ленина: 5 · Склад Мира: 2»).
 * Renders nothing when 1C doesn't split the stock.
 */
export function WarehouseStock({ list, className = "" }: { list: WarehouseQty[] | null | undefined; className?: string }) {
  if (!list?.length) return null;
  return (
    <p className={`text-xs text-gray-600 ${className}`}>
      {list.map((w, i) => (
        <span key={w.name} className="whitespace-nowrap">
          {i > 0 && <span className="text-gray-300"> · </span>}
          {w.name}: <b className="text-gray-800">{w.qty}</b>
        </span>
      ))}
    </p>
  );
}
