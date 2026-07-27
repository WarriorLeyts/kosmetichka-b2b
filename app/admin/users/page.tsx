import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  picker: "Сборщик",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  picker: "bg-green-100 text-green-700",
};

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (payload?.role !== "admin") redirect("/admin");

  // SEC-1: select only safe fields — password intentionally excluded
  // Note: User model uses "login" field (unique), not "email"
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сотрудники</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{users.length} записей</span>
          <Link
            href="/admin/users/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            + Создать
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left font-semibold text-slate-600">#</th>
              <th className="p-3 text-left font-semibold text-slate-600">Имя</th>
              <th className="p-3 text-left font-semibold text-slate-600">Логин</th>
              <th className="p-3 text-center font-semibold text-slate-600">Роль</th>
              <th className="p-3 text-left font-semibold text-slate-600">Дата создания</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-slate-50">
                <td className="p-3 text-xs text-slate-400">{u.id}</td>
                <td className="p-3 font-semibold">{u.name || "—"}</td>
                <td className="p-3 text-slate-500">{u.login || "—"}</td>
                <td className="p-3 text-center">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="p-3">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Изменить
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  Сотрудники не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
