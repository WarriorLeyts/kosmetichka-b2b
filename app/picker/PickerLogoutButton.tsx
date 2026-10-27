"use client";

export default function PickerLogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    // полная перезагрузка намеренно: серверная шапка не должна остаться с прежним пользователем
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
    >
      Выйти
    </button>
  );
}
