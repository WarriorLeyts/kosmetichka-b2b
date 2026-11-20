import { NextResponse } from "next/server";
import { currentCustomerId } from "../../_auth";
import { CARD_PRICE, CARD_PRODUCT_NAME } from "@/lib/cardPurchase";
import { findCardCatalogProduct } from "@/lib/cardCatalog";

export async function GET() {
  if (!await currentCustomerId()) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  try {
    const product = await findCardCatalogProduct();
    return NextResponse.json({ product: { id: product.id, name: CARD_PRODUCT_NAME, retailPrice: CARD_PRICE, discountPrice: CARD_PRICE, stock: null, minOrderQty: 1 } });
  } catch { return NextResponse.json({ error: "Оформление карты пока недоступно. Обратитесь к менеджеру." }, { status: 503 }); }
}
