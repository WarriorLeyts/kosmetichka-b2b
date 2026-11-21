import { originalPerfumeCategories, shopReserve } from "../scripts/wholesale-stock-policy.js";
import { prisma } from "@/lib/prisma";
import { WHOLESALE_MIN_STOCK, isWholesaleType } from "@/lib/utils";

/**
 * Wholesale orders are taken from two 1C warehouses (owner, 2026-11-09):
 *  - «1. Мега Косметичка» — the shop: 12 of each product stay on its shelves; original perfume has no reserve;
 *  - «0. Склад» — the warehouse.
 * The picker chooses per line how many come from each (OrderItem.warehouseQty); until then the order's main
 * source (the shop when it has the whole order, otherwise the warehouse) and the 12-piece rule suggest it. The order goes to 1С as two «Заказ покупателя»: СА-000241 (shop) and СК-000241 (warehouse).
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

/** Where most of a wholesale order is taken from (owner, 2026-11-11) */
export type Primary = "shop" | "stock";

/**
 * The shop has the whole order (every line, keeping the applicable reserve) → all from the shop, the warehouse isn't bothered.
 * Otherwise the warehouse is needed anyway → it gives everything it has, the shop only what it hasn't.
 */
export function orderPrimary(lines: { qty: number; shopQty: number; stockQty: number; shopKeep?: number }[]): Primary {
  return lines.every((l) => shopFree(l.shopQty, l.shopKeep) >= Math.max(0, Math.round(l.qty))) ? "shop" : "stock";
}

/**
 * One line's split. The main source gives what it has, the other one the rest. The product reserve
 * holds: 0 for original perfume, otherwise 12. What neither has is a shortage («Не хватает» at the
 * picking) and stays on the warehouse (a wholesaler can only order Product.wholesaleStock = shop − reserve + warehouse anyway).
 */
export function suggestSplit(qty: number, shopQty: number, stockQty: number, primary: Primary = "shop", shopKeep = WHOLESALE_MIN_STOCK): Split {
  const q = Math.max(0, Math.round(qty));
  if (primary === "stock") {
    const fromStock = Math.min(q, Math.max(0, Math.floor(stockQty)));
    const shop = Math.min(q - fromStock, shopFree(shopQty, shopKeep));
    return { shop, stock: q - shop };
  }
  const shop = Math.min(q, shopFree(shopQty, shopKeep));
  return { shop, stock: q - shop };
}

/** What the shop may give above this product’s reserve. */
export function shopFree(shopQty: number, shopKeep = WHOLESALE_MIN_STOCK): number {
  return Math.max(0, Math.floor(shopQty) - shopKeep);
}

/** 12 or fewer in the shop: the suggestion takes nothing from there (the picker still may, agreed with the administrator) */
export function onlyStock(shopQty: number, shopKeep = WHOLESALE_MIN_STOCK): boolean {
  return shopFree(shopQty, shopKeep) === 0;
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
export async function shopAndStock(productIds: number[], knownTotals?: { id: number; stock: number | null }[]): Promise<Map<number, { shop: number; stock: number }>> {
  const out = new Map<number, { shop: number; stock: number }>();
  const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return out;
  const rows = await prisma.productWarehouseStock
    .findMany({
      where: { product: { id: { in: ids } }, warehouseGuid: { in: [SHOP_WAREHOUSE, STOCK_WAREHOUSE] } },
      select: { qty: true, warehouseGuid: true, product: { select: { id: true } } },
    });
  // When 1C supplies only total stock, the importer treats it as shop stock.
  const totals = knownTotals ?? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true } });
  const splitIds = new Set(rows.map(r => r.product.id));
  const totalById = new Map(totals.map(p => [p.id, Math.max(0, Number(p.stock) || 0)]));
  for (const id of ids) out.set(id, { shop: splitIds.has(id) ? 0 : totalById.get(id) ?? 0, stock: 0 });
  for (const r of rows) {
    const v = out.get(r.product.id)!;
    if (r.warehouseGuid === SHOP_WAREHOUSE) v.shop = r.qty;
    else v.stock = r.qty;
  }
  return out;
}

/** Each line's split: the picker's, or the rule's (`suggested`): the order's main source first */
export async function orderSplits(items: { id: number; productId: number; quantity: number; warehouseQty?: unknown }[]) {
  const ids = [...new Set(items.map(i => i.productId))];
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true, categoryGuid: true, categoryGuid1C: true } }),
    prisma.category.findMany({ select: { guid: true, name: true, parentGuid: true } }),
  ]);
  const have = await shopAndStock(ids, products);
  const exempt = originalPerfumeCategories(categories);
  const keeps = new Map(products.map(p => [p.id, shopReserve(p, exempt)]));
  const out = new Map<number, Split & { suggested: boolean; shopQty: number; stockQty: number; onlyStock: boolean; primary: Primary; shopKeep: number }>();
  const primary = orderPrimary(items.map((it) => ({ qty: it.quantity, shopQty: have.get(it.productId)?.shop ?? 0, stockQty: have.get(it.productId)?.stock ?? 0, shopKeep: keeps.get(it.productId) ?? WHOLESALE_MIN_STOCK })));
  for (const it of items) {
    const h = have.get(it.productId) ?? { shop: 0, stock: 0 };
    // The reserve applies per product; original perfume may use its final unit.
    const keep = keeps.get(it.productId) ?? WHOLESALE_MIN_STOCK;
    const locked = onlyStock(h.shop, keep);
    const saved = savedSplit(it.warehouseQty, it.quantity);
    const s = saved ?? suggestSplit(it.quantity, h.shop, h.stock, primary, keep);
    out.set(it.id, { ...s, suggested: !saved, shopQty: h.shop, stockQty: h.stock, onlyStock: locked, primary, shopKeep: keep });
  }
  return out;
}
