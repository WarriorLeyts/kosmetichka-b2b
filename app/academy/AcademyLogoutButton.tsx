"use client";

export default function AcademyLogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    // полная перезагрузка намеренно: серверная шапка не должна остаться с прежним пользователем
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/academy/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="cursor-pointer rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-50"
    >
      Выйти
    </button>
  );
}
