import type { Metadata } from "next";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import PickerLogoutButton from "./PickerLogoutButton";

export const metadata: Metadata = {
  title: "Сборщик — Kosmetichka B2B",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Сборщик",
  },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  picker: "Сборщик",
};

export default async function PickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  let roleLabel = "Сборщик";
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload?.role) {
        roleLabel = ROLE_LABELS[payload.role as string] ?? "Сборщик";
      }
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-3 safe-area-inset-top">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-lg font-black">📦 {roleLabel}</div>
          <PickerLogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 pb-8">{children}</main>
    </div>
  );
}
