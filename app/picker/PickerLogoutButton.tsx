"use client";

import { useRouter } from "next/navigation";

export default function PickerLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
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
