import { odataConfigured, odataGet } from "@/scripts/onec-odata.js";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";
import { CARD_PRICE, CARD_PRODUCT_NAME, isCardProduct } from "@/lib/cardPurchase";

export async function GET() {
  if (!await currentCustomerId()) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
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
  if (products.length !== 1 || !isCardProduct(products[0])) return NextResponse.json({ error: "Оформление карты пока недоступно. Обратитесь к менеджеру." }, { status: 503 });
  return NextResponse.json({ product: { id: products[0].id, name: CARD_PRODUCT_NAME, retailPrice: CARD_PRICE, discountPrice: CARD_PRICE, stock: null, minOrderQty: 1 } });
}
