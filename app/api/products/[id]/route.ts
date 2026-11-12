import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerStock, guestStock, isWholesaleType, withFlatPrices } from "@/lib/utils";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { verifyToken } from "@/lib/auth";

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
      images: true,
      prices: true,
      variants: {
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
  const token = cookieStore.get("auth_token")?.value;
  const customer = token ? await verifyCustomerToken(token) : null;
  const staffToken = customer?.id ? null : cookieStore.get("admin_token")?.value;
  const staff = staffToken ? await verifyToken(staffToken) : null;
  const signedIn = Boolean(customer?.id) || ["admin", "manager", "picker"].includes(String(staff?.role ?? ""));
  const flat = withFlatPrices(product);
  if (signedIn) {
    // a wholesale customer sees what he may order: the shop minus its 12 + the warehouse
    const priceType = customer?.id
      ? (await prisma.customer.findUnique({ where: { id: Number(customer.id) }, select: { priceType: true } }))?.priceType ?? null
      : null;
    return NextResponse.json(isWholesaleType(priceType) ? { ...flat, stock: customerStock(flat.stock, priceType, product.wholesaleStock) } : flat);
  }
  const { wholesalePrice: _w, bigWholesalePrice: _b, prices: _p, ...guest } = flat; // eslint-disable-line @typescript-eslint/no-unused-vars
  return NextResponse.json({ ...guest, prices: [], stock: guestStock(flat.stock) });
}
