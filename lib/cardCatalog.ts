import { odataConfigured, odataGet } from "@/scripts/onec-odata.js";
import { prisma } from "@/lib/prisma";
import { CARD_PRODUCT_NAME, isCardProduct } from "./cardPurchase";

/** Resolve the real 1C service item; never create a substitute nomenclature. */
export async function findCardCatalogProduct() {
  let products = await prisma.product.findMany({ where: process.env.LOYALTY_CARD_PRODUCT_GUID
    ? { guid: process.env.LOYALTY_CARD_PRODUCT_GUID }
    : { name: { equals: CARD_PRODUCT_NAME, mode: "insensitive" } }, select: { id: true, name: true, guid: true } });
  // The service item may be excluded from the regular catalogue exchange. Import its real GUID,
  // never create a replacement nomenclature in 1С. Hidden: purchased only through the form.
  if (!products.length && odataConfigured()) {
    try {
      const rows: { Ref_Key: string; Description: string }[] = await odataGet("Catalog_Номенклатура", {
        $filter: `DeletionMark eq false and IsFolder eq false and ${process.env.LOYALTY_CARD_PRODUCT_GUID ? `Ref_Key eq guid'${process.env.LOYALTY_CARD_PRODUCT_GUID.replace(/[^a-fA-F0-9-]/g, "")}'` : `Description eq '${CARD_PRODUCT_NAME}'`}`,
        $select: "Ref_Key,Description", $top: "2",
      });
      if (rows.length === 1) {
        const product = await prisma.product.upsert({ where: { guid: rows[0].Ref_Key }, update: {}, create: { guid: rows[0].Ref_Key, name: rows[0].Description, hidden: true }, select: { id: true, name: true, guid: true } });
        products = [product];
      }
    } catch (e) { console.warn("[card-product]", e instanceof Error ? e.message : e); }
  }
  if (products.length !== 1 || !isCardProduct(products[0])) throw new Error("Оформление карты пока недоступно. Не найдена номенклатура карты в 1С.");
  return products[0];
}
