import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import PasswordInput from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "manager", label: "Менеджер" },
  { value: "picker", label: "Сборщик" },
  { value: "admin", label: "Администратор" },
];

async function createUser(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  const name = String(formData.get("name") || "");
  const login = String(formData.get("login") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "manager");
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");

  if (!login) redirect("/admin/users/new?error=login_required");
  if (!password) redirect("/admin/users/new?error=password_required");
  if (password !== passwordConfirm) redirect("/admin/users/new?error=password_mismatch");
  if (password.length < 6) redirect("/admin/users/new?error=password_too_short");

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { name, login, role, password: hashed },
    });
    redirect(`/admin/users/${user.id}?saved=1`);
  } catch {
    redirect("/admin/users/new?error=login_taken");
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  login_required: "Логин не может быть пустым",
  login_taken: "Этот логин уже занят",
  password_required: "Пароль обязателен",
  password_mismatch: "Пароли не совпадают",
  password_too_short: "Пароль должен быть не короче 6 символов",
};

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  const p = await searchParams;
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
        <h1 className="text-2xl font-bold">Новый сотрудник</h1>
      </div>

      {errorKey && ERROR_MESSAGES[errorKey] && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm font-medium text-red-700">
          ⚠️ {ERROR_MESSAGES[errorKey]}
        </div>
      )}

      <form
        action={createUser}
        className="rounded-2xl border bg-white p-6 shadow-sm space-y-4 max-w-lg"
      >
        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">Имя</label>
          <input
            name="name"
            placeholder="Иван Иванов"
            className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            Логин <span className="text-red-500">*</span>
          </label>
          <input
            name="login"
            placeholder="ivan"
            required
            className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">Роль</label>
          <select
            name="role"
            defaultValue="manager"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              Пароль <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              placeholder="Минимум 6 символов"
              required
              className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              Повтор пароля <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              name="passwordConfirm"
              autoComplete="new-password"
              placeholder="Повторите пароль"
              required
              className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
        >
          Создать сотрудника
        </button>
      </form>
    </div>
  );
}
