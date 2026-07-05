import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

// ─── Server Actions ───────────────────────────────────────────────────────────

async function updateOrder(formData: FormData) {
  "use server";

  const orderId = Number(formData.get("orderId"));
  const comment = String(formData.get("comment") || "");

  const itemIds = formData.getAll("itemId");
  const quantities = formData.getAll("quantity");
  const prices = formData.getAll("price");

  let total = 0;

  for (let i = 0; i < itemIds.length; i++) {
    const itemId = Number(itemIds[i]);
    const quantity = Number(quantities[i]);
    const price = Number(prices[i]);
    const itemTotal = quantity * price;

    total += itemTotal;

    await prisma.orderItem.update({
      where: { id: itemId },
      data: { quantity, price, total: itemTotal },
    });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { comment, total },
  });

  redirect(`/admin/orders/${orderId}`);
}

async function sendToAssembly(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("orderId"));
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "assembly" },
  });
  redirect(`/admin/orders/${orderId}`);
}

async function sendToConsultation(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("orderId"));
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "consultation" },
  });
  redirect(`/admin/orders/${orderId}`);
}

async function sendBackToAssembly(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("orderId"));
  // Clear all existing checks so picker re-checks everything
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (order) {
    await prisma.orderItemCheck.deleteMany({
      where: { orderItemId: { in: order.items.map((i) => i.id) } },
    });
  }
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "assembly" },
  });
  redirect(`/admin/orders/${orderId}`);
}

async function approveForPayment(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("orderId"));
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "payment" },
  });
  redirect(`/admin/orders/${orderId}`);
}

async function cancelOrder(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("orderId"));
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });
  redirect("/admin/orders");
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Ожидание менеджера";
    case "assembly":
      return "Проверка/Сборка";
    case "consultation":
      return "Консультация";
    case "payment":
      return "К оплате";
    case "exported":
      return "Выгружен в 1С";
    case "cancelled":
      return "Отменен";
    default:
      return status;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "assembly":
      return "bg-blue-100 text-blue-800";
    case "consultation":
      return "bg-orange-100 text-orange-800";
    case "payment":
      return "bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-white";
    case "exported":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getCheckLabel(status: string) {
  switch (status) {
    case "ok":
      return "ОК";
    case "out_of_stock":
      return "Нет в наличии";
    case "expired":
      return "Просрочен";
    case "bad_condition":
      return "Плохой товарный вид";
    case "insufficient_qty":
      return "Не хватает кол-во";
    default:
      return status;
  }
}

function getCheckColor(status: string) {
  switch (status) {
    case "ok":
      return "bg-green-100 text-green-700";
    case "out_of_stock":
      return "bg-red-100 text-red-700";
    case "expired":
      return "bg-orange-100 text-orange-700";
    case "bad_condition":
      return "bg-yellow-100 text-yellow-700";
    case "insufficient_qty":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: {
        include: {
          check: {
            include: {
              picker: true,
            },
          },
        },
      },
    },
  });

  if (!order) notFound();

  const hasChecks = order.items.some((i) => i.check);
  const hasIssues = order.items.some(
    (i) => i.check && i.check.status !== "ok"
  );
  const allOk = hasChecks && !hasIssues;
  const isEditable = !["exported", "cancelled"].includes(order.status);

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">

        {/* Header */}
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <a
                  href="/admin/orders"
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  ←
                </a>
                <h1 className="text-3xl font-black">Заказ №{order.id}</h1>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {order.customer.companyName || order.customer.name}
              </p>
              <p className="text-sm text-slate-500">
                Телефон: {order.customer.phone}
              </p>
              <p className="text-sm text-slate-400">
                {new Date(order.createdAt).toLocaleString("ru-RU")}
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black">{order.total} ₽</div>
              <span
                className={`mt-2 inline-block rounded-full px-4 py-1.5 text-sm font-black ${getStatusColor(
                  order.status
                )}`}
              >
                {getStatusLabel(order.status)}
              </span>
            </div>
          </div>
        </div>

        {/* Status transition buttons */}
        {isEditable && (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-slate-400">
              Управление статусом
            </h2>

            <div className="flex flex-wrap gap-3">
              {/* pending → assembly */}
              {order.status === "pending" && (
                <form action={sendToAssembly}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2.5 font-black text-white hover:bg-blue-700"
                  >
                    Отправить на сборку →
                  </button>
                </form>
              )}

              {/* assembly → consultation */}
              {order.status === "assembly" && (
                <form action={sendToConsultation}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-orange-500 px-5 py-2.5 font-black text-white hover:bg-orange-600"
                  >
                    Отправить на консультацию →
                  </button>
                </form>
              )}

              {/* assembly → payment (if all OK) */}
              {order.status === "assembly" && allOk && (
                <form action={approveForPayment}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-5 py-2.5 font-black text-white"
                  >
                    Подтвердить к оплате ✓
                  </button>
                </form>
              )}

              {/* consultation → assembly (with check reset) */}
              {order.status === "consultation" && (
                <form action={sendBackToAssembly}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2.5 font-black text-white hover:bg-blue-700"
                  >
                    ← Вернуть на сборку
                  </button>
                </form>
              )}

              {/* consultation → payment */}
              {order.status === "consultation" && (
                <form action={approveForPayment}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-5 py-2.5 font-black text-white"
                  >
                    Подтвердить к оплате ✓
                  </button>
                </form>
              )}

              {/* Cancel — always available for non-terminal statuses */}
              <form action={cancelOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="rounded-xl border border-red-200 px-5 py-2.5 font-black text-red-600 hover:bg-red-50"
                >
                  Отменить заказ
                </button>
              </form>
            </div>

            {/* Hint when assembly has issues */}
            {order.status === "assembly" && hasIssues && (
              <p className="mt-3 text-sm text-orange-600">
                ⚠ Сборщик выявил проблемы — рекомендуется отправить на консультацию или вернуть на сборку после замены товаров
              </p>
            )}

            {/* Hint when assembly, no checks yet */}
            {order.status === "assembly" && !hasChecks && (
              <p className="mt-3 text-sm text-slate-500">
                Ожидание проверки сборщиком…
              </p>
            )}
          </div>
        )}

        {/* Picker check results */}
        {hasChecks && (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-slate-400">
              Результат проверки сборщика
            </h2>
            <div className="overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Товар</th>
                    <th className="p-3">Запрошено</th>
                    <th className="p-3">Статус</th>
                    <th className="p-3">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-t ${
                        item.check && item.check.status !== "ok"
                          ? "bg-red-50/30"
                          : ""
                      }`}
                    >
                      <td className="p-3 font-medium">{item.productName}</td>
                      <td className="p-3">{item.quantity} шт.</td>
                      <td className="p-3">
                        {item.check ? (
                          <div>
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${getCheckColor(
                                item.check.status
                              )}`}
                            >
                              {getCheckLabel(item.check.status)}
                            </span>
                            {item.check.status === "insufficient_qty" &&
                              item.check.availableQty !== null && (
                                <div className="mt-1 text-xs text-slate-500">
                                  Есть: {item.check.availableQty} шт.
                                </div>
                              )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Не проверен</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">
                        {item.check?.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Order items edit form */}
        {isEditable && (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-slate-400">
              Позиции заказа
            </h2>

            <form action={updateOrder} className="space-y-4">
              <input type="hidden" name="orderId" defaultValue={order.id} />

              <div className="overflow-hidden rounded-2xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="p-3">Товар</th>
                      <th className="p-3">Штрихкод</th>
                      <th className="p-3">Кол-во</th>
                      <th className="p-3">Цена</th>
                      <th className="p-3">Сумма</th>
                    </tr>
                  </thead>

                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-3">
                          <input
                            type="hidden"
                            name="itemId"
                            value={item.id}
                          />
                          {item.productName}
                        </td>

                        <td className="p-3">{item.barcode || "—"}</td>

                        <td className="p-3">
                          <input
                            name="quantity"
                            type="number"
                            min="1"
                            defaultValue={item.quantity}
                            className="w-24 rounded-xl border p-2"
                          />
                        </td>

                        <td className="p-3">
                          <input
                            name="price"
                            type="number"
                            min="0"
                            defaultValue={item.price}
                            className="w-28 rounded-xl border p-2"
                          />
                        </td>

                        <td className="p-3 font-bold">{item.total} ₽</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <textarea
                name="comment"
                defaultValue={order.comment || ""}
                placeholder="Комментарий менеджера"
                className="w-full rounded-2xl border p-3"
                rows={3}
              />

              <button
                type="submit"
                className="rounded-xl border px-6 py-3 font-black hover:bg-slate-50"
              >
                Сохранить изменения
              </button>
            </form>
          </div>
        )}

        {/* Read-only view for terminal statuses */}
        {!isEditable && (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-slate-400">
              Позиции заказа
            </h2>
            <div className="overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Товар</th>
                    <th className="p-3">Штрихкод</th>
                    <th className="p-3">Кол-во</th>
                    <th className="p-3">Цена</th>
                    <th className="p-3">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3">{item.barcode || "—"}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{item.price} ₽</td>
                      <td className="p-3 font-bold">{item.total} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.comment && (
              <p className="mt-3 text-sm text-slate-600">
                Комментарий: {order.comment}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
