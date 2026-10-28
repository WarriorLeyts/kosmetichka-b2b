import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffEditor } from "@/lib/academy";
import TestEditor from "@/components/academy/TestEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новый тест" };

export default async function NewTest() {
  if (!(await requireStaffEditor())) redirect("/academy");
  return (
    <div className="space-y-4 pt-4">
      <div>
        <Link href="/academy/manage" className="text-sm font-bold text-slate-500 hover:text-pink-500">
          ← Все тесты
        </Link>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Новый тест</h1>
      </div>
      <TestEditor
        initial={{ id: null, slug: null, title: "", description: "", passScore: 80, timeLimitMin: null, isPublished: true, attempts: 0, questions: [] }}
      />
    </div>
  );
}
