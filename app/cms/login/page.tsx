import { redirect } from "next/navigation";
import { getCmsUser } from "@/lib/cms/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Вход" };

export default async function CmsLogin() {
  if (await getCmsUser()) redirect("/");
  return (
    <div className="flex min-h-full items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
        <div className="text-lg font-bold tracking-wide text-[#8E1B47]">КОСМЕТИЧКА</div>
        <p className="mb-6 text-sm text-neutral-500">Админ-панель сайта. Вход для администраторов и менеджеров.</p>
        <LoginForm />
      </div>
    </div>
  );
}
