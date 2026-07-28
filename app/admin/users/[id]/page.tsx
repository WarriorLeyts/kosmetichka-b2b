import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import bcrypt from "bcryptjs";
import PasswordInput from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "admin", label: "Администратор" },
  { value: "manager", label: "Менеджер" },
  { value: "picker", label: "Сборщик" },
];

async function updateUser(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/users");

  const name = String(formData.get("name") || "");
  const login = String(formData.get("login") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "manager");
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");

  if (!login) {
    redirect(`/admin/users/${id}?error=login_required`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { name, login, role };

  if (password.trim()) {
    if (password !== passwordConfirm) {
      redirect(`/admin/users/${id}?error=password_mismatch`);
    }
    if (password.length < 6) {
      redirect(`/admin/users/${id}?error=password_too_short`);
    }
    data.password = await bcrypt.hash(password, 10);
  }

  try {
    await prisma.user.update({ where: { id }, data });
  } catch {
    redirect(`/admin/users/${id}?error=login_taken`);
  }

  redirect(`/admin/users/${id}?saved=1`);
}

async function deleteUser(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/users");

  // Don't allow self-deletion
  if (id === (payload.id as number)) {
    redirect(`/admin/users/${id}?error=cant_delete_self`);
  }

  await prisma.user.delete({ where: { id } });
  redirect("/admin/users?deleted=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  login_required: "Логин не может быть пустым",
  login_taken: "Этот логин уже занят",
  password_mismatch: "Пароли не совпадают",
  password_too_short: "Пароль должен быть не короче 6 символов",
  cant_delete_self: "Нельзя удалить собственную учётную запись",
};

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  const { id } = await params;
  const userId = Number(id);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, login: true, role: true, createdAt: true },
  });

  if (!user) notFound();

  const p = await searchParams;
  const saved = p.saved === "1";
  const errorKey = p.error || "";

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center gap-4">
        <a
          href="/admin/users"
          className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-100 text-slate-600"
        >
          ←
        </a>
        <div>
          <h1 className="text-2xl font-bold">Редактирование сотрудника</h1>
          <p className="text-sm text-slate-400">
            Создан: {new Date(user.createdAt).toLocaleDateString("ru-RU")}
          </p>
        </div>
      </div>

      {saved && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-4 text-sm font-medium text-green-700">
          ✅ Данные сохранены
        </div>
      )}
      {errorKey && ERROR_MESSAGES[errorKey] && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm font-medium text-red-700">
          ⚠️ {ERROR_MESSAGES[errorKey]}
        </div>
      )}

      <form
        action={updateUser}
        className="rounded-2xl border bg-white p-6 shadow-sm space-y-4 max-w-lg"
      >
        <input type="hidden" name="id" value={user.id} />

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">Имя</label>
          <input
            name="name"
            defaultValue={user.name || ""}
            placeholder="Иван Иванов"
            className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">Логин</label>
          <input
            name="login"
            defaultValue={user.login || ""}
            placeholder="ivan"
            required
            className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">Роль</label>
          <select
            name="role"
            defaultValue={user.role}
            className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <hr className="border-slate-200" />

        <p className="text-sm font-bold text-slate-700">Смена пароля</p>
        <p className="text-xs text-slate-400 -mt-3">Оставьте пустым, чтобы не менять</p>

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

      {/* Danger zone — only admin can delete, and can't delete themselves */}
      {(payload.id as number) !== user.id && (
        <div className="mt-6 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-bold text-red-700 mb-1">Опасная зона</p>
          <p className="text-xs text-red-500 mb-4">
            Удаление сотрудника необратимо. Убедитесь, что у него нет активных задач.
          </p>
          <form action={deleteUser}>
            <input type="hidden" name="id" value={user.id} />
            <button
              type="submit"
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Удалить сотрудника
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
