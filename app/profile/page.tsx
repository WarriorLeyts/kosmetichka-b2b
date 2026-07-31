import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import bcrypt from "bcryptjs";
import PasswordInput from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

async function updateProfile(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const id = payload.id as number;

  const name = String(formData.get("name") || "");
  const companyName = String(formData.get("companyName") || "");
  const phone = String(formData.get("phone") || "");
  const email = String(formData.get("email") || "");
  const city = String(formData.get("city") || "");
  const address = String(formData.get("address") || "");
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");

  // Check email uniqueness if changed
  if (email) {
    const current = await prisma.customer.findUnique({ where: { id }, select: { email: true } });
    if (email !== current?.email) {
      const emailTaken = await prisma.customer.findFirst({ where: { email, NOT: { id } } });
      if (emailTaken) redirect("/profile?error=email_taken");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { name, companyName, phone, email, city, address };

  if (password.trim()) {
    if (password !== passwordConfirm) {
      // Redirect back with error flag — simple approach for server action
      redirect("/profile?error=password_mismatch");
    }
    if (password.length < 6) {
      redirect("/profile?error=password_too_short");
    }
    data.password = await bcrypt.hash(password, 10);
  }

  await prisma.customer.update({ where: { id }, data });
  redirect("/profile?saved=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  password_mismatch: "Пароли не совпадают",
  password_too_short: "Пароль должен быть не короче 6 символов",
  email_taken: "Этот email уже используется другим аккаунтом",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: payload.id as number },
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      inn: true,
      city: true,
      address: true,
      priceType: true,
      manager: true,
    },
  });

  if (!customer) redirect("/login");

  const params = await searchParams;
  const saved = params.saved === "1";
  const errorKey = params.error || "";

  const PRICE_LABELS: Record<string, string> = {
    retail: "Розница",
    wholesale: "Опт",
    big_wholesale: "Крупный опт",
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <a
            href="/orders"
            className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-100"
          >
            ←
          </a>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Мой профиль</h1>
            {customer.manager && (
              <p className="text-sm text-indigo-600 font-semibold">
                👤 Менеджер: {customer.manager}
              </p>
            )}
          </div>
          <div className="ml-auto">
            <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {PRICE_LABELS[customer.priceType] ?? customer.priceType}
            </span>
          </div>
        </div>

        {/* Success / error banners */}
        {saved && (
          <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-4 text-sm font-medium text-green-700">
            ✅ Данные успешно сохранены
          </div>
        )}
        {errorKey && ERROR_MESSAGES[errorKey] && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm font-medium text-red-700">
            ⚠️ {ERROR_MESSAGES[errorKey]}
          </div>
        )}

        {/* Read-only info */}
        {customer.inn && (
          <div className="mb-4 rounded-xl border bg-white p-4 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">ИНН:</span> {customer.inn}
            <span className="ml-2 text-xs text-slate-400">(изменение через менеджера)</span>
          </div>
        )}

        {/* Edit form */}
        <form action={updateProfile} className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Имя</label>
              <input
                name="name"
                defaultValue={customer.name || ""}
                placeholder="Иван Иванов"
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Компания</label>
              <input
                name="companyName"
                defaultValue={customer.companyName || ""}
                placeholder="ООО «Название»"
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Телефон</label>
              <input
                name="phone"
                defaultValue={customer.phone || ""}
                placeholder="+7 900 000 00 00"
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={customer.email || ""}
                placeholder="mail@example.com"
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">Город</label>
            <input
              name="city"
              defaultValue={customer.city || ""}
              placeholder="Москва"
              className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">Адрес доставки</label>
            <textarea
              name="address"
              defaultValue={customer.address || ""}
              rows={2}
              placeholder="ул. Пушкина, д. 1"
              className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <hr className="border-slate-200" />

          <p className="text-sm font-bold text-slate-700">Смена пароля</p>
          <p className="text-xs text-slate-400 -mt-3">
            Оставьте пустым, чтобы не менять пароль
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Новый пароль</label>
              <PasswordInput
                name="password"
                autoComplete="new-password"
                placeholder="Минимум 6 символов"
                className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Повтор пароля</label>
              <PasswordInput
                name="passwordConfirm"
                autoComplete="new-password"
                placeholder="Повторите пароль"
                className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
          >
            Сохранить изменения
          </button>
        </form>
      </div>
    </main>
  );
}
