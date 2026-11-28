import { catalogViewer } from "@/lib/catalogViewer";
import { hasCatalogPhoto } from "@/scripts/catalog-visibility.js";
import { brandProductExcluded } from "@/lib/brandVisibility";
import { getCampaign } from "@/lib/campaignSettings";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerStock, guestStock, isWholesaleType, withFlatPrices, maskWholesalePrices } from "@/lib/utils";
import { cookies } from "next/headers";
import { arrivalLabels, withArrivalLabel } from "@/lib/arrivals";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = Number(id);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "Товар не найден" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      brand: true,
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      prices: true,
      variants: {
        where: { available: true },
        include: { image: true },
        orderBy: { sortOrder: "asc" },
      },
      // every barcode of the product in 1С (a box has its own) — shown on the product page
      barcodes: { select: { barcode: true, unitName: true }, orderBy: { barcode: "asc" } },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Товар не найден — возможно, его убрали из каталога" }, { status: 404 });
  }

  // wholesale prices only for signed-in customers and staff (as /api/catalog/products)
  const cookieStore = await cookies();
  const { customer, staff } = await catalogViewer(_request, cookieStore);
  const photoStaff = ["admin", "manager"].includes(String(staff?.role ?? ""));
  const signedIn = Boolean(customer?.id) || ["admin", "manager", "picker"].includes(String(staff?.role ?? ""));
  // скрытый в админ-панели товар — только сотрудникам
  if (!staff && (product.hidden || await brandProductExcluded(product))) {
    return NextResponse.json({ error: "Товар не найден — возможно, его убрали из каталога" }, { status: 404 });
  }
  const photoMissing = !hasCatalogPhoto(product);
  let ownOrder: { id: number } | null = null;
  if (!photoStaff && photoMissing) {
    ownOrder = customer?.id ? await prisma.order.findFirst({
      where: { customerId: Number(customer.id), items: { some: { productId } } },
      select: { id: true }, orderBy: { id: "desc" },
    }) : null;
    if (!ownOrder) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }
  const priceType = customer?.id
    ? (await prisma.customer.findUnique({ where: { id: Number(customer.id) }, select: { priceType: true } }))?.priceType ?? null
    : null;
  // «Новинка» / «Снова в наличии» (lib/arrivals.ts) — as on the catalog card
  const flatWithLabels = withArrivalLabel(withFlatPrices(product, await getCampaign(), priceType === "franchise" || !!staff), await arrivalLabels(isWholesaleType(priceType)));
  const flat = { ...flatWithLabels, ...(ownOrder ? { orderOnly: true, orderId: ownOrder.id } : {}) };
  if (signedIn) {
    // a wholesale customer sees what he may order: the shop minus its 12 + the warehouse
    return NextResponse.json(isWholesaleType(priceType) ? { ...flat, stock: customerStock(flat.stock, priceType, product.wholesaleStock) } : flat, ownOrder ? { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } } : undefined);
  }
  return NextResponse.json({ ...maskWholesalePrices(flat), stock: guestStock(flat.stock) });
}

