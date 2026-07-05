import type { Metadata } from "next";
import PickerLogoutButton from "./PickerLogoutButton";

export const metadata: Metadata = {
  title: "Сборщик — Kosmetichka B2B",
};

export default function PickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-lg font-black">Рабочее место сборщика</div>
          <PickerLogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
