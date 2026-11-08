import { prisma } from "@/lib/prisma";

/**
 * Stock per 1C warehouse («Разбивать остатки по складам»). STAFF ONLY: use it in admin / picker /
 * team endpoints, never in customer APIs — customers see only Product.stock (the total).
 */
export type WarehouseQty = { name: string; qty: number };

/** productId → warehouses with stock (by name). Products without a split are absent from the map. */
export async function warehouseStockByProductId(productIds: number[]): Promise<Map<number, WarehouseQty[]>> {
  const map = new Map<number, WarehouseQty[]>();
  const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return map;
  const rows = await prisma.productWarehouseStock
    .findMany({
      where: { product: { id: { in: ids } }, qty: { gt: 0 } },
      select: { qty: true, product: { select: { id: true } }, warehouse: { select: { name: true } } },
    })
    .catch((e: unknown) => {
      // the table is not there yet (prisma/manual/2026-11-08-warehouse-stock.sql) — show the total only
      console.error("[warehouse-stock]", e instanceof Error ? e.message : e);
      return [];
    });
  for (const r of rows) {
    const list = map.get(r.product.id) ?? [];
    list.push({ name: r.warehouse.name, qty: r.qty });
    map.set(r.product.id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return map;
}

/** «Склад Ленина: 5 · Склад Мира: 2» */
export function formatWarehouseStock(list: WarehouseQty[] | null | undefined): string {
  return (list ?? []).map((w) => `${w.name}: ${w.qty}`).join(" · ");
}
