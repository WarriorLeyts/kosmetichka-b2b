import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Панель администратора</h1>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Link
          href="/admin/customers"
          className="rounded-xl border bg-white p-5 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        >
          <h2 className="text-lg font-semibold">Клиенты</h2>
          <p className="mt-1 text-sm text-gray-500">
            Просмотр зарегистрированных покупателей
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="rounded-xl border bg-white p-5 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        >
          <h2 className="text-lg font-semibold">Пользователи</h2>
          <p className="mt-1 text-sm text-gray-500">
            Менеджеры, админы и роли
          </p>
        </Link>

        <Link
          href="/admin/orders"
          className="rounded-xl border bg-white p-5 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        >
          <h2 className="text-lg font-semibold">Заказы</h2>
          <p className="mt-1 text-sm text-gray-500">
            Новые заказы клиентов
          </p>
        </Link>
      </div>
    </div>
  );
}
