import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  if (!["pending", "consultation", "assembly"].includes(order.status)) {
    return NextResponse.json(
      { error: "Редактирование доступно только для заказов в ожидании, консультации или сборке" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const updates: {
    id: number;
    quantity: number;
    price: number;
    variantName?: string | null;
    variantImageUrl?: string | null;
  }[] = body.items ?? [];
  const removeIds: number[] = body.removeIds ?? [];
  const newItems: {
    productId: number;
    productName: string;
    barcode?: string | null;
    quantity: number;
    price: number;
    variantName?: string | null;
    variantImageUrl?: string | null;
  }[] = body.newItems ?? [];

  const orderItemIds = new Set(order.items.map((i) => i.id));
  for (const u of updates) {
    if (!orderItemIds.has(u.id)) {
      return NextResponse.json({ error: `Позиция ${u.id} не принадлежит заказу` }, { status: 400 });
    }
  }

  // ── Compute diff snapshot BEFORE applying changes ─────────────────────────
  const snapshot = {
    added: newItems.map((ni) => ({
      productName: ni.productName,
      quantity: ni.quantity,
      price: ni.price,
      variantName: ni.variantName ?? null,
    })),
    removed: order.items
      .filter((i) => removeIds.includes(i.id))
      .map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        price: i.price,
        variantName: (i as any).variantName ?? null,
      })),
    changed: updates
      .filter((u) => {
        const orig = order.items.find((i) => i.id === u.id);
        return orig && orig.quantity !== u.quantity;
      })
      .map((u) => {
        const orig = order.items.find((i) => i.id === u.id)!;
        return {
          productName: orig.productName,
          oldQty: orig.quantity,
          newQty: u.quantity,
          price: u.price,
          variantName: (orig as any).variantName ?? null,
        };
      }),
  };
  // ──────────────────────────────────────────────────────────────────────────

  if (removeIds.length > 0) {
    const validRemoveIds = removeIds.filter((rid) => orderItemIds.has(rid));
    await prisma.orderItemCheck.deleteMany({ where: { orderItemId: { in: validRemoveIds } } });
    await prisma.orderItemPhoto.deleteMany({ where: { orderItemId: { in: validRemoveIds } } });
    await prisma.orderItem.deleteMany({ where: { id: { in: validRemoveIds } } });
  }

  // Batch all updates and creates into a single transaction — O(1) round trips instead of O(n)
  const updateOps = updates
    .filter((u) => !removeIds.includes(u.id))
    .map((u) => {
      const qty = Math.max(1, Math.round(u.quantity));
      const price = Math.max(0, Math.round(u.price));
      return prisma.orderItem.update({
        where: { id: u.id },
        data: {
          quantity: qty,
          price,
          total: qty * price,
          ...(u.variantName !== undefined ? { variantName: u.variantName ?? null } : {}),
          ...(u.variantImageUrl !== undefined ? { variantImageUrl: u.variantImageUrl ?? null } : {}),
        },
      });
    });

  const createOps = newItems.map((ni) => {
    const qty = Math.max(1, Math.round(ni.quantity));
    const price = Math.max(0, Math.round(ni.price));
    return prisma.orderItem.create({
      data: {
        orderId,
        productId: ni.productId,
        productName: ni.productName,
        barcode: ni.barcode ?? null,
        quantity: qty,
        price,
        total: qty * price,
        variantName: ni.variantName ?? null,
        variantImageUrl: ni.variantImageUrl ?? null,
      },
    });
  });

  if (updateOps.length > 0 || createOps.length > 0) {
    await prisma.$transaction([...updateOps, ...createOps]);
  }

  const remaining = await prisma.orderItem.findMany({ where: { orderId } });
  const newTotal = remaining.reduce((s, i) => s + i.total, 0);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      total: newTotal,
      customerConfirmed: false,
      changesSnapshot: snapshot,
    },
  });

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: { companyName: true, name: true, phone: true, city: true, inn: true },
      },
      picker: { select: { id: true, name: true } },
      items: {
        include: {
          check: { include: { picker: { select: { name: true } } } },
          photos: true,
        },
      },
      messages: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ order: updated });
}
