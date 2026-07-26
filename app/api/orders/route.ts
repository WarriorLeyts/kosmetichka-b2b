import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { items, comment } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Корзина пустая" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: Number(payload.id) },
  });

  if (!customer) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
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
        throw new Error(`Товар ${item.id} не найден`);
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
        variantName: item.variantName ?? null,
        variantImageUrl: item.variantImageUrl ?? null,
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
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
  });
}
