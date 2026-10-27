import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_ROLE, requireStaffEditor } from "@/lib/academy";
import { STORES } from "@/lib/academy-register";

export const dynamic = "force-dynamic";
export const metadata = { title: "Сотрудники" };

const dt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" });

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; q?: string; deleted?: string }>;
}) {
  const editor = await requireStaffEditor();
  if (!editor) redirect("/academy");

  const sp = await searchParams;
  const store = sp.store === "none" ? "none" : sp.store && STORES.includes(sp.store) ? sp.store : null;
  const q = (sp.q ?? "").trim().slice(0, 60);

  const users = await prisma.user.findMany({
    where: {
      role: EMPLOYEE_ROLE,
      ...(store === "none" ? { store: null } : store ? { store } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { login: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ store: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      login: true,
      position: true,
      store: true,
      createdAt: true,
      _count: { select: { academyAttempts: true } },
    },
  });

  const link = (s: string | null) => {
    const p = new URLSearchParams();
    if (s) p.set("store", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/academy/staff?${qs}` : "/academy/staff";
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Сотрудники</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Зарегистрированные в тестах · {users.length}
          </p>
        </div>
        <form action="/academy/staff" className="flex gap-2">
          {store && <input type="hidden" name="store" value={store} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="ФИО или логин"
            className="h-10 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-pink-300"
          />
          <button className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:border-pink-300">
            Найти
          </button>
        </form>
      </div>

      {sp.deleted === "1" && (
        <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Сотрудник удалён.</div>
      )}

      <nav className="flex flex-wrap gap-1.5 text-sm font-bold" aria-label="Магазин">
        {[null, ...STORES, "none"].map((s) => (
          <Link
            key={s ?? "all"}
            href={link(s)}
            aria-current={s === store ? "page" : undefined}
            className={`rounded-xl px-3 py-1.5 ${
              s === store
                ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-pink-300"
            }`}
          >
            {s === null ? "Все магазины" : s === "none" ? "Без магазина" : s}
          </Link>
        ))}
      </nav>

      {users.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center font-bold text-slate-600">
          Никого не нашлось.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-black uppercase text-slate-500">
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-3 py-3">Должность</th>
                <th className="px-3 py-3">Магазин</th>
                <th className="px-3 py-3">Попыток</th>
                <th className="px-3 py-3">Регистрация</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.login}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{u.position ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-700">{u.store ?? <span className="text-rose-500">не указан</span>}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{u._count.academyAttempts}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{dt.format(u.createdAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={`/academy/staff/${u.id}`} className="font-bold text-pink-500 hover:underline">
                      Изменить
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
