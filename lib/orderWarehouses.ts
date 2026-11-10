import { prisma } from "@/lib/prisma";
import { WHOLESALE_MIN_STOCK, isWholesaleType } from "@/lib/utils";

/**
 * Wholesale orders are taken from two 1C warehouses (owner, 2026-11-09):
 *  - «1. Мега Косметичка» — the shop: at least 12 of each product must stay on its shelves;
 *  - «0. Склад» — the warehouse.
 * The picker chooses per line how many come from each (OrderItem.warehouseQty); until then the 12-piece
 * rule suggests it. The order goes to 1С as two «Заказ покупателя»: СА-000241 (shop) and СК-000241 (warehouse).
 * Retail orders: as before, one document from the shop.
 */
export const SHOP_WAREHOUSE = process.env.ONEC_SHOP_WAREHOUSE || "bd887c46-1148-11f1-80cf-10ffe0cbb38c"; // 1. Мега Косметичка
export const STOCK_WAREHOUSE = process.env.ONEC_STOCK_WAREHOUSE || "a5ecdd7f-0fca-11f1-a212-d45d64282814"; // 0. Склад
export const SHOP_LABEL = "Мега Косметичка";
export const STOCK_LABEL = "Склад";

export type Split = { shop: number; stock: number };

/** Orders of wholesale customers are split between the two warehouses */
export function splitsWarehouses(priceType: string | null | undefined): boolean {
  return isWholesaleType(priceType);
}

/**
 * The 12-piece rule: take from the shop only what leaves ≥ 12 there, the rest from the warehouse. What neither
 * has is a shortage («Не хватает» at the picking) — the shop never goes below 12 (a wholesaler can only order
 * Product.wholesaleStock = shop − 12 + warehouse anyway).
 */
export function suggestSplit(qty: number, shopQty: number, _stockQty: number): Split {
  const q = Math.max(0, Math.round(qty));
  const shop = Math.min(q, shopFree(shopQty));
  return { shop, stock: q - shop };
}

/** what the shop may give: everything above its 12 */
export function shopFree(shopQty: number): number {
  return Math.max(0, Math.floor(shopQty) - WHOLESALE_MIN_STOCK);
}

/** 12 or fewer in the shop: only the warehouse, no choice at the picking (owner, 2026-11-11) */
export function onlyStock(shopQty: number): boolean {
  return shopFree(shopQty) === 0;
}

/** The picker's choice for a line, if it still adds up to the line's quantity */
export function savedSplit(warehouseQty: unknown, quantity: number): Split | null {
  if (!warehouseQty || typeof warehouseQty !== "object") return null;
  const m = warehouseQty as Record<string, unknown>;
  const stock = Math.max(0, Math.round(Number(m[STOCK_WAREHOUSE]) || 0));
  const shop = Math.max(0, Math.round(Number(m[SHOP_WAREHOUSE]) || 0));
  return stock + shop === Math.round(quantity) ? { shop, stock } : null;
}

export function toWarehouseQty(split: Split): Record<string, number> {
  return { [SHOP_WAREHOUSE]: split.shop, [STOCK_WAREHOUSE]: split.stock };
}

/** Stock of the two warehouses for products (by product id) */
export async function shopAndStock(productIds: number[]): Promise<Map<number, { shop: number; stock: number }>> {
  const out = new Map<number, { shop: number; stock: number }>();
  const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return out;
  const rows = await prisma.productWarehouseStock
    .findMany({
      where: { product: { id: { in: ids } }, warehouseGuid: { in: [SHOP_WAREHOUSE, STOCK_WAREHOUSE] } },
      select: { qty: true, warehouseGuid: true, product: { select: { id: true } } },
    })
    .catch(() => []);
  for (const id of ids) out.set(id, { shop: 0, stock: 0 });
  for (const r of rows) {
    const v = out.get(r.product.id)!;
    if (r.warehouseGuid === SHOP_WAREHOUSE) v.shop = r.qty;
    else v.stock = r.qty;
  }
  return out;
}

/** Each line's split: the picker's, or the rule's (`suggested`) */
export async function orderSplits(items: { id: number; productId: number; quantity: number; warehouseQty?: unknown }[]) {
  const have = await shopAndStock(items.map((i) => i.productId));
  const out = new Map<number, Split & { suggested: boolean; shopQty: number; stockQty: number; onlyStock: boolean }>();
  for (const it of items) {
    const h = have.get(it.productId) ?? { shop: 0, stock: 0 };
    const locked = onlyStock(h.shop);
    // a saved choice that takes from a shop with ≤ 12 doesn't count any more
    const saved0 = savedSplit(it.warehouseQty, it.quantity);
    const saved = saved0 && !(locked && saved0.shop > 0) ? saved0 : null;
    const s = saved ?? suggestSplit(it.quantity, h.shop, h.stock);
    out.set(it.id, { ...s, suggested: !saved, shopQty: h.shop, stockQty: h.stock, onlyStock: locked });
  }
  return out;
}
