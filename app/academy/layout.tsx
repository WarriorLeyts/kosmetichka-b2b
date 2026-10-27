import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { canSeeResults, getStaff, ROLE_NAMES } from "@/lib/academy";
import AcademyLogoutButton from "./AcademyLogoutButton";

export const metadata: Metadata = {
  title: { default: "Тесты для сотрудников", template: "%s · Тесты Косметички" },
  robots: { index: false, follow: false },
};

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();

  return (
    <div className="min-h-screen bg-slate-50">
      {staff && (
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/academy" className="flex items-center gap-2 text-lg font-black">
              <GraduationCap className="h-6 w-6 text-pink-500" />
              <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent">
                Тесты Косметички
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-bold text-slate-600">
              <Link href="/academy" className="hover:text-pink-500">Тесты</Link>
              {canSeeResults(staff.role) && (
                <Link href="/academy/results" className="hover:text-pink-500">Результаты сотрудников</Link>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="font-semibold text-slate-500">
                {staff.login}
                <span className="hidden sm:inline"> · {ROLE_NAMES[staff.role] ?? staff.role}</span>
              </span>
              <AcademyLogoutButton />
            </div>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-4xl p-4 pb-12">{children}</main>
    </div>
  );
}
