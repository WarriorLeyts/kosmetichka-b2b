import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { orderSums } from "@/lib/orderPricing";
import { priceFor } from "@/lib/pricing";
import { orderTier, repriceOrder } from "@/lib/orderTier";
import { isMaxmaOrder, loyaltyResponse, recalcOrderLoyalty } from "@/lib/maxmaOrders";
import { changeChatMessage, logOrderChanges, orderChanges, summarizeRows } from "@/lib/orderChanges";
import { notifyLater } from "@/lib/notify";
import { markProductRequestAdded, productRequestAdded } from "@/lib/productRequest";
import { lockedByOrderId } from "@/lib/orderLock";

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

async function editItems(request: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: { select: { priceType: true } } },
  });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  // the manager changes the order only while collecting it («Сборка»)
  if (order.status !== "assembly") {
    return NextResponse.json(
      { error: "Менять состав можно только во время сборки. Нажмите «Собрать заказ» или «Вернуть на сборку»." },
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
  // whole pieces, 1…100 000 (a missing / broken number must not reach the database half-way through)
  const badQty = (q: unknown) => !Number.isInteger(Number(q)) || Number(q) < 1 || Number(q) > 100_000;
  if (updates.some((u) => !removeIds.includes(u.id) && badQty(u.quantity)) || newItems.some((ni) => badQty(ni.quantity))) {
    return NextResponse.json({ error: "Укажите количество — целое число от 1" }, { status: 400 });
  }
  // an order is never left without lines (to drop it — cancel it)
  const removing = new Set(removeIds.filter((rid) => orderItemIds.has(rid)));
  if (order.items.length - removing.size + newItems.length <= 0) {
    return NextResponse.json({ error: "В заказе должна остаться хотя бы одна позиция. Чтобы отказаться от заказа, отмените его." }, { status: 400 });
  }
  // the customer's «Добавить товар» card is added once (two managers / a double tap)
  const requestMessageId = Number(body.requestMessageId);
  if (Number.isInteger(requestMessageId) && requestMessageId > 0 && (await productRequestAdded(orderId, requestMessageId))) {
    return NextResponse.json({ error: "Этот товар из чата уже добавлен в заказ", code: "already_added" }, { status: 409 });
  }

  // Nobody changes prices in an order: existing lines keep their price, added products get the
  // customer's catalogue price (by their price type) — whatever price the screen sent is ignored.
  const origPrice = new Map(order.items.map((i) => [i.id, i.price]));
  for (const u of updates) u.price = origPrice.get(u.id) ?? 0;
  if (newItems.length > 0) {
    // at the order's current prices («Опт»: by its sum); repriceOrder below moves every line if the sum crosses 5 000 / 50 000 ₽
    const type = orderTier(order);
    const products = await prisma.product.findMany({
      where: { id: { in: newItems.map((ni) => Number(ni.productId)) } },
      select: { id: true, name: true, barcode: true, prices: { select: { priceType: true, price: true } }, variants: { select: { name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const ni of newItems) {
      const p = byId.get(Number(ni.productId));
      if (!p) return NextResponse.json({ error: `Товар ${ni.productId} не найден` }, { status: 400 });
      const pm = Object.fromEntries(p.prices.map((x) => [x.priceType, Number(x.price)]));
      const price = Math.round(
        priceFor({ retailPrice: pm.retail, discountPrice: pm.discount, wholesalePrice: pm.wholesale, bigWholesalePrice: pm.big_wholesale }, type)
      );
      if (!price) return NextResponse.json({ error: `Цена для товара «${p.name}» не найдена` }, { status: 400 });
      ni.price = price;
      // name and barcode from the catalogue (what reaches invoices and 1C), never from the request
      ni.productName = p.name;
      ni.barcode = p.barcode || null;
      const variant = typeof ni.variantName === "string" ? ni.variantName.trim() : "";
      if (variant && !p.variants.some((v) => v.name === variant)) {
        return NextResponse.json({ error: `У товара «${p.name}» нет варианта «${variant}»` }, { status: 400 });
      }
      ni.variantName = variant || null;
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

  // removals, updates and new lines in one transaction: all of them or nothing
  const validRemoveIds = [...removing];
  const removeOps = validRemoveIds.length
    ? [
        prisma.orderItemCheck.deleteMany({ where: { orderItemId: { in: validRemoveIds } } }),
        prisma.orderItemPhoto.deleteMany({ where: { orderItemId: { in: validRemoveIds } } }),
        prisma.orderItem.deleteMany({ where: { id: { in: validRemoveIds } } }),
      ]
    : [];
  // the manager set the quantity himself → the assembly mark of that line no longer applies
  // (otherwise «Просрочен 2 шт.» would be taken out of the new quantity again on «Отправить проверку»)
  const origQty = new Map(order.items.map((i) => [i.id, i.quantity]));
  const changedQtyIds = updates.filter((u) => !removing.has(u.id) && origQty.get(u.id) !== Math.round(Number(u.quantity))).map((u) => u.id);
  const checkOps = changedQtyIds.length ? [prisma.orderItemCheck.deleteMany({ where: { orderItemId: { in: changedQtyIds } } })] : [];

  const updateOps = updates
    .filter((u) => !removing.has(u.id))
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

  const ops = [...removeOps, ...checkOps, ...updateOps, ...createOps];
  if (ops.length > 0) await prisma.$transaction(ops);

  // «Опт»: the sum moved across 5 000 / 50 000 ₽ → every line at the new price
  const tierChange = await repriceOrder(orderId).catch((e) => {
    console.error("[order-items] tier:", e instanceof Error ? e.message : e);
    return null;
  });

  const remaining = await prisma.orderItem.findMany({ where: { orderId } });

  // added from the customer's «Добавить товар» card in the chat → the card shows «Добавлено» from now on
  // (so the same request is not added twice, and a product already in the order can be added again)
  if (Number.isInteger(requestMessageId) && requestMessageId > 0) {
    await markProductRequestAdded(orderId, requestMessageId).catch((e) => console.error("[order-items] request:", e instanceof Error ? e.message : e));
  }

  // who changed what — the customer sees it on the order and gets a notification
  const staff = await prisma.user.findUnique({ where: { id: Number(user.id) }, select: { name: true } }).catch(() => null);
  const changed = await logOrderChanges(orderId, "staff", staff?.name ?? "Менеджер", order.items, remaining);
  if (changed.length > 0) {
    // the same card in the order chat (photos + what changed) — from the manager, the customer sees it there
    await prisma.orderMessage
      .create({ data: { orderId, source: "customer", isFromPicker: true, userId: Number(user.id), text: await changeChatMessage("staff", staff?.name ?? null, changed) } })
      .catch((e) => console.error("[order-changes] chat:", e instanceof Error ? e.message : e));
    if (tierChange) {
      await prisma.orderMessage
        .create({ data: { orderId, source: "customer", isFromPicker: true, userId: Number(user.id), text: tierChange.text } })
        .catch((e) => console.error("[order-changes] tier chat:", e instanceof Error ? e.message : e));
    }
    notifyLater(order.customerId, {
      kind: "order",
      title: `Менеджер изменил заказ №${orderId}`,
      body: summarizeRows(changed, 5),
      link: `/order/${orderId}`,
    });
  }

  // Without a promo code / bonuses: total = Σ line totals. With them, recalcOrderLoyalty
  // below sets the line discounts, Order.discount, bonusesApplied and Order.total.
  const loyaltyOrder = isMaxmaOrder(order);
  const sums = orderSums(remaining);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      ...(loyaltyOrder ? {} : { total: sums.total }),
      customerConfirmed: false,
      changesSnapshot: snapshot,
      // the customer confirms the whole order when it is sent to him «На проверку»
    },
  });
  const loyalty = loyaltyOrder ? await recalcOrderLoyalty(orderId) : null;

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

  // first photo of every product in the order, so items added just now show their pictures at once
  const productImages: Record<number, string> = {};
  const imageRows = updated
    ? await prisma.productImage.findMany({
        where: { productId: { in: [...new Set(updated.items.map((i) => i.productId))] } },
        select: { productId: true, path: true },
        orderBy: { id: "asc" },
      })
    : [];
  for (const r of imageRows) productImages[r.productId] ??= r.path;

  // who changed which line — the editor shows it right after saving
  const changes = updated ? await orderChanges(orderId, updated.items) : null;

  if (!loyalty) return NextResponse.json({ order: updated, productImages, changes });
  return NextResponse.json({ order: updated, productImages, changes, ...loyaltyResponse(loyalty) });
}

// one change of an order at a time (double taps, the customer and the manager at once)
export const PUT = lockedByOrderId(editItems);
