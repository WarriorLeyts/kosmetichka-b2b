import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

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
      data: {
        quantity,
        price,
        total: itemTotal,
      },
    });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      comment,
      total,
    },
  });

  redirect("/admin/orders");
}

async function approveOrder(formData: FormData) {
  "use server";

  const orderId = Number(formData.get("orderId"));

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "approved",
    },
  });

  redirect("/admin/orders");
}

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: {
      id: Number(id),
    },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl rounded-3xl border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black">Заказ №{order.id}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Клиент: {order.customer.companyName || order.customer.name}
            </p>
            <p className="text-sm text-slate-500">
              Телефон: {order.customer.phone}
            </p>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black">{order.total} ₽</div>
            <div className="text-sm text-slate-500">{order.status}</div>
          </div>
        </div>

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
                      <input type="hidden" name="itemId" value={item.id} />
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

                    <td className="p-3 font-bold">
                      {item.total} ₽
                    </td>
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

          <div className="flex justify-between">
            <button
              type="submit"
              className="rounded-xl border px-6 py-3 font-black"
            >
              Сохранить изменения
            </button>
          </div>
        </form>

        {order.status !== "approved" && order.status !== "exported" && (
          <form action={approveOrder} className="mt-4">
            <input type="hidden" name="orderId" defaultValue={order.id} />

            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-3 font-black text-white"
            >
              Подтвердить заказ
            </button>
          </form>
        )}
      </div>
    </main>
  );
}