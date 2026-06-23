import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import bcrypt from "bcryptjs";

async function updateCustomer(formData: FormData) {
  "use server";

  const id = Number(formData.get("id"));

  const name = String(formData.get("name") || "");
  const companyName = String(formData.get("companyName") || "");
  const phone = String(formData.get("phone") || "");
  const email = String(formData.get("email") || "");
  const inn = String(formData.get("inn") || "");
  const city = String(formData.get("city") || "");
  const address = String(formData.get("address") || "");
  const priceType = String(formData.get("priceType") || "wholesale");
  const isActive = formData.get("isActive") === "active";
  const password = String(formData.get("password") || "");

  const data: any = {
    name,
    companyName,
    phone,
    email,
    inn,
    city,
    address,
    priceType,
    isActive,
  };

  if (password.trim()) {
    data.password = await bcrypt.hash(password, 10);
  }

  await prisma.customer.update({
    where: { id },
    data,
  });

  redirect("/admin/customers");
}

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: {
      id: Number(id),
    },
  });

  if (!customer) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-black">
          Редактирование клиента #{customer.id}
        </h1>

        <form action={updateCustomer} className="space-y-4">
          <input type="hidden" name="id" defaultValue={customer.id} />

          <div>
            <label className="mb-1 block text-sm font-bold">Имя</label>
            <input
              name="name"
              defaultValue={customer.name || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Компания</label>
            <input
              name="companyName"
              defaultValue={customer.companyName || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Телефон</label>
            <input
              name="phone"
              defaultValue={customer.phone || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Email</label>
            <input
              name="email"
              defaultValue={customer.email || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">ИНН</label>
            <input
              name="inn"
              defaultValue={customer.inn || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Город</label>
            <input
              name="city"
              defaultValue={customer.city || ""}
              className="w-full rounded-xl border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Адрес</label>
            <textarea
              name="address"
              defaultValue={customer.address || ""}
              className="w-full rounded-xl border p-3"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Тип цены</label>
            <select
              name="priceType"
              defaultValue={customer.priceType}
              className="w-full rounded-xl border p-3"
            >
              <option value="retail">Розница</option>
              <option value="wholesale">Опт</option>
              <option value="big_wholesale">Крупный опт</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Статус</label>
            <select
              name="isActive"
              defaultValue={customer.isActive ? "active" : "blocked"}
              className="w-full rounded-xl border p-3"
            >
              <option value="active">Активен</option>
              <option value="blocked">Заблокирован</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">
              Новый пароль
            </label>
            <input
              name="password"
              type="password"
              placeholder="Оставь пустым, если не менять"
              className="w-full rounded-xl border p-3"
            />
          </div>

          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-3 font-black text-white"
          >
            Сохранить
          </button>
        </form>
      </div>
    </main>
  );
}