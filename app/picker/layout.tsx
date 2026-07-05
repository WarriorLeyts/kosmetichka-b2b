import type { Metadata } from "next";

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
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
