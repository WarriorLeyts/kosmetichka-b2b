import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { productImages, requireStaffEditor } from "@/lib/academy";
import TestEditor, { type EditorProduct } from "@/components/academy/TestEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Редактирование теста" };

export default async function EditTest({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  if (!(await requireStaffEditor())) redirect("/academy");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const test = await prisma.academyTest.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      _count: { select: { attempts: true } },
    },
  });
  if (!test) notFound();
  const sp = await searchParams;

  const ids = test.questions.map((q) => q.productId).filter((x): x is number => x !== null);
  const [products, images] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, article: true, barcode: true } }),
    productImages(ids),
  ]);
  const byId = new Map<number, EditorProduct>(products.map((p) => [p.id, { ...p, image: images.get(p.id) ?? null }]));

  return (
    <div className="space-y-4 pt-4">
      <div>
        <Link href="/academy/manage" className="text-sm font-bold text-slate-500 hover:text-pink-500">
          ← Все тесты
        </Link>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{test.title}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Ссылка для сотрудников:{" "}
          <Link href={`/academy/t/${test.slug}`} className="text-pink-500 hover:underline">
            /academy/t/{test.slug}
          </Link>
        </p>
      </div>
      {sp.created && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Тест создан.</div>}
      <TestEditor
        initial={{
          id: test.id,
          slug: test.slug,
          title: test.title,
          description: test.description ?? "",
          passScore: test.passScore,
          timeLimitMin: test.timeLimitMin,
          isPublished: test.isPublished,
          attempts: test._count.attempts,
          questions: test.questions.map((q) => ({
            // Товар удалили из каталога — вопрос остаётся, просто без фото
            product: (q.productId && byId.get(q.productId)) || null,
            text: q.text,
            explanation: q.explanation ?? "",
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
          })),
        }}
      />
    </div>
  );
}
