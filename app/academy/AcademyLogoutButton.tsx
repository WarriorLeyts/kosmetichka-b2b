"use client";

import { useRouter } from "next/navigation";

export default function AcademyLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/academy/login");
    router.refresh();
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
