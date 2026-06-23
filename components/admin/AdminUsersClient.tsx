"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save } from "lucide-react";

export function AdminUsersClient({ users }: { users: any[] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [error, setError] = useState("");

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, login, password, role }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Ошибка создания пользователя");
      return;
    }

    setName("");
    setLogin("");
    setPassword("");
    setRole("manager");

    router.refresh();
  }

  async function updateUser(id: number, data: any) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    router.refresh();
  }

  async function deleteUser(id: number) {
    if (!confirm("Удалить пользователя?")) return;

    await fetch(`/api/admin/users/${id}`, {
      method: "DELETE",
    });

    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mb-8">
        <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-4xl font-black text-transparent">
          Пользователи админки
        </h1>

        <p className="mt-2 text-sm font-semibold text-slate-500">
          Создание менеджеров, смена паролей и назначение ролей
        </p>
      </div>

      <form
        onSubmit={createUser}
        className="mb-6 grid grid-cols-1 gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-5"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none"
        />

        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Логин"
          className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          type="password"
          className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none"
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
        >
          <option value="admin">admin</option>
          <option value="manager">manager</option>
          <option value="content">content</option>
        </select>

        <button
          type="submit"
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white"
        >
          <Plus size={16} />
          Создать
        </button>

        {error && (
          <div className="md:col-span-5 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">
            {error}
          </div>
        )}
      </form>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-4">Имя</th>
              <th className="px-5 py-4">Логин</th>
              <th className="px-5 py-4">Роль</th>
              <th className="px-5 py-4">Новый пароль</th>
              <th className="px-5 py-4 text-right">Действия</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                updateUser={updateUser}
                deleteUser={deleteUser}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function UserRow({
  user,
  updateUser,
  deleteUser,
}: {
  user: any;
  updateUser: (id: number, data: any) => void;
  deleteUser: (id: number) => void;
}) {
  const [name, setName] = useState(user.name);
  const [login, setLogin] = useState(user.login);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");

  return (
    <tr className="border-t border-slate-100">
      <td className="px-5 py-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none"
        />
      </td>

      <td className="px-5 py-4">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none"
        />
      </td>

      <td className="px-5 py-4">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none"
        >
          <option value="admin">admin</option>
          <option value="manager">manager</option>
          <option value="content">content</option>
        </select>
      </td>

      <td className="px-5 py-4">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Оставить пустым"
          type="password"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none"
        />
      </td>

      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          <button
            onClick={() =>
              updateUser(user.id, {
                name,
                login,
                role,
                password: password || undefined,
              })
            }
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-100"
          >
            <Save size={14} />
            Сохранить
          </button>

          <button
            onClick={() => deleteUser(user.id)}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-500 hover:bg-red-100"
          >
            <Trash2 size={14} />
            Удалить
          </button>
        </div>
      </td>
    </tr>
  );
}