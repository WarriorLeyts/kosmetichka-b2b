import type { WarehouseQty } from "@/lib/warehouseStock";

/**
 * Staff only: stock per 1C warehouse under the total, as pills «0. Склад  46» (name + bold number).
 * Renders nothing when 1C doesn't split the stock.
 */
export function WarehouseStock({ list, className = "" }: { list: WarehouseQty[] | null | undefined; className?: string }) {
  if (!list?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {list.map((w) => (
        <span
          key={w.name}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900"
        >
          <span className="truncate">{w.name}</span>
          <b className="text-[13px] font-extrabold text-violet-950">{w.qty}</b>
        </span>
      ))}
    </div>
  );
}
