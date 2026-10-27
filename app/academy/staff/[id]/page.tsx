import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_ROLE, requireStaffEditor } from "@/lib/academy";
import { checkStaffEdit, DEFAULT_POSITION, POSITIONS, STORES } from "@/lib/academy-register";
import ConfirmDeleteButton from "./ConfirmDeleteButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Сотрудник" };

/** Редактировать можно только «Сотрудника (только тесты)» — не админов, менеджеров, сборщиков и HR. */
async function loadEmployee(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, login: true, role: true, position: true, store: true, createdAt: true },
  });
  return u && u.role === EMPLOYEE_ROLE ? u : null;
}

async function saveEmployee(formData: FormData) {
  "use server";
  const editor = await requireStaffEditor();
  if (!editor) redirect("/academy");

  const id = Number(formData.get("id"));
  if (!(await loadEmployee(id))) redirect("/academy/staff");

  const check = checkStaffEdit({
    name: formData.get("name"),
    position: formData.get("position"),
    store: formData.get("store"),
    password: formData.get("password"),
    password2: formData.get("password2"),
  });
  if (!check.ok) redirect(`/academy/staff/${id}?error=${encodeURIComponent(check.error)}`);

  const { name, position, store, password } = check.data;
  await prisma.user.update({
    // role в where — на случай, если между проверкой и записью роль поменяли
    where: { id, role: EMPLOYEE_ROLE },
    data: { name, position, store, ...(password ? { password: await bcrypt.hash(password, 10) } : {}) },
  });
  redirect(`/academy/staff/${id}?saved=${password ? "password" : "1"}`);
}

async function deleteEmployee(formData: FormData) {
  "use server";
  const editor = await requireStaffEditor();
  if (!editor) redirect("/academy");

  const id = Number(formData.get("id"));
  if (!(await loadEmployee(id))) redirect("/academy/staff");
  await prisma.user.delete({ where: { id, role: EMPLOYEE_ROLE } }); // результаты тестов удаляются вместе с ним
  redirect("/academy/staff?deleted=1");
}

const input =
  "h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300";

export default async function StaffEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const editor = await requireStaffEditor();
  if (!editor) redirect("/academy");

  const { id } = await params;
  const u = await loadEmployee(Number(id));
  if (!u) notFound();

  const sp = await searchParams;
  const attempts = await prisma.academyAttempt.count({ where: { userId: u.id } });

  return (
    <div className="space-y-5 pt-4">
      <div>
        <Link href="/academy/staff" className="text-sm font-bold text-slate-500 hover:text-pink-500">
          ← Все сотрудники
        </Link>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{u.name}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Логин {u.login} · попыток прохождения: {attempts}
          {attempts > 0 && (
            <>
              {" · "}
              <Link href={`/academy/results${u.store ? `?store=${encodeURIComponent(u.store)}` : ""}`} className="text-pink-500 hover:underline">
                результаты
              </Link>
            </>
          )}
        </p>
      </div>

      {sp.saved && (
        <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          {sp.saved === "password" ? "Сохранено, пароль изменён. Сообщите новый пароль сотруднику." : "Сохранено."}
        </div>
      )}
      {sp.error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">{sp.error}</div>}

      <form action={saveEmployee} className="max-w-xl space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={u.id} />
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Фамилия и имя</span>
          <input name="name" defaultValue={u.name} required className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Должность</span>
          <select
            name="position"
            defaultValue={u.position && POSITIONS.includes(u.position) ? u.position : DEFAULT_POSITION}
            required
            className={`${input} cursor-pointer`}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Магазин</span>
          <select name="store" defaultValue={u.store ?? ""} required className={`${input} cursor-pointer`}>
            <option value="" disabled>
              Выберите магазин
            </option>
            {STORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-3 rounded-2xl border border-dashed border-slate-200 p-4">
          <legend className="px-1 text-xs font-bold text-slate-500">Новый пароль — если сотрудник забыл старый</legend>
          <input name="password" type="password" autoComplete="new-password" placeholder="От 8 символов" className={input} />
          <input name="password2" type="password" autoComplete="new-password" placeholder="Ещё раз" className={input} />
        </fieldset>

        <button className="h-11 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 font-black text-white">
          Сохранить
        </button>
      </form>

      <form action={deleteEmployee} className="max-w-xl">
        <input type="hidden" name="id" value={u.id} />
        <ConfirmDeleteButton
          message={`Удалить ${u.name}? Вместе с аккаунтом удалятся и все результаты тестов (${attempts}). Это нельзя отменить.`}
        />
      </form>
    </div>
  );
}
