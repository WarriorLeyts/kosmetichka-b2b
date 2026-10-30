import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withFlatPrices } from "@/lib/utils";
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
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
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
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // wholesale prices only for signed-in customers and staff (as /api/catalog/products)
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  const customer = token ? await verifyCustomerToken(token) : null;
  const staffToken = customer?.id ? null : cookieStore.get("admin_token")?.value;
  const staff = staffToken ? await verifyToken(staffToken) : null;
  const signedIn = Boolean(customer?.id) || ["admin", "manager", "picker"].includes(String(staff?.role ?? ""));
  const flat = withFlatPrices(product);
  if (signedIn) return NextResponse.json(flat);
  const { wholesalePrice: _w, bigWholesalePrice: _b, prices: _p, ...guest } = flat; // eslint-disable-line @typescript-eslint/no-unused-vars
  return NextResponse.json({ ...guest, prices: [] });
}
