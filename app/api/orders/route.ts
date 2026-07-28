import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

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

  // Уведомление администратору о новом заказе
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const clientName = customer.companyName || customer.name || customer.phone || `#${customer.id}`;
    sendMail({
      to: adminEmail,
      subject: `Новый заказ #${order.id} — ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">🛍️ Новый заказ #${order.id}</h2>
          <p style="margin:0 0 8px;color:#475569;"><b>Клиент:</b> ${clientName}</p>
          ${customer.phone ? `<p style="margin:0 0 8px;color:#475569;"><b>Телефон:</b> ${customer.phone}</p>` : ""}
          <p style="margin:0 0 24px;color:#475569;"><b>Сумма:</b> ${order.total} ₽</p>
          <a href="https://kosmetichka-opt.ru/admin/orders/${order.id}"
             style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;">
            Открыть заказ
          </a>
        </div>
      `,
    }).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
  });
}
