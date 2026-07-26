import type { Metadata } from "next";
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

export default function PickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-3 safe-area-inset-top">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-lg font-black">📦 Сборщик</div>
          <PickerLogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 pb-8">{children}</main>
    </div>
  );
}
