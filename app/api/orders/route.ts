import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "\u041d\u0443\u0436\u043d\u043e \u0432\u043e\u0439\u0442\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442" },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json(
      { error: "\u041e\u0448\u0438\u0431\u043a\u0430 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438" },
      { status: 401 }
    );
  }

  const { items, comment } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "\u041a\u043e\u0440\u0437\u0438\u043d\u0430 \u043f\u0443\u0441\u0442\u0430\u044f" },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: Number(payload.id) },
  });

  if (!customer) {
    return NextResponse.json(
      { error: "\u041e\u0448\u0438\u0431\u043a\u0430 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438" },
      { status: 401 }
    );
  }

  const productIds: number[] = items.map((item: any) => Number(item.id));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { prices: true },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  let order;

  try {
    const orderItems = items.map((item: any) => {
      const product = productById.get(Number(item.id));

      if (!product) {
        throw new Error(`\u0422\u043e\u0432\u0430\u0440 ${item.id} \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d`);
      }

      const matchedPrice = product.prices.find(
        (p) => p.priceType === customer.priceType
      );
      const fallbackPrice = product.prices.find(
        (p) => p.priceType === "retail"
      );

      const price = Math.round(matchedPrice?.price ?? fallbackPrice?.price ?? 0);
      const quantity = Number(item.quantity) || 0;

      return {
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || null,
        quantity,
        price,
        total: price * quantity,
      };
    });

    let total = 0;
    for (const it of orderItems) total += it.total;

    order = await prisma.order.create({
      data: {
        customerId: Number(payload.id),
        status: "pending",
        total,
        comment: comment || null,
        items: {
          create: orderItems,
        },
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
  });
}
