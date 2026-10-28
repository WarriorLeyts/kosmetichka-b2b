import { prisma } from "@/lib/prisma";
import { checkTestDraft, slugify, type TestDraft } from "@/lib/academy-tests";

export type SaveResult = { ok: true; data: TestDraft } | { ok: false; error: string; question?: number };

/** Проверка тела запроса + что все товары из вопросов есть в каталоге. */
export async function readDraft(request: Request): Promise<SaveResult> {
  const body = await request.json().catch(() => null);
  const r = checkTestDraft(body);
  if (!r.ok) return r;
  const ids = [...new Set(r.data.questions.map((q) => q.productId).filter((id): id is number => id !== null))];
  if (ids.length) {
    const found = new Set((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id));
    const bad = r.data.questions.findIndex((q) => q.productId !== null && !found.has(q.productId));
    if (bad >= 0) return { ok: false, error: `Вопрос ${bad + 1}: товар не найден в каталоге`, question: bad };
  }
  return r;
}

export function questionsCreate(d: TestDraft) {
  return d.questions.map((q, i) => ({
    order: i + 1,
    text: q.text,
    explanation: q.explanation,
    productId: q.productId,
    options: { create: q.options.map((o, j) => ({ order: j + 1, text: o.text, isCorrect: o.isCorrect })) },
  }));
}

/** Свободный адрес: uhod-za-kozhey, uhod-za-kozhey-2, … */
export async function freeSlug(title: string) {
  const base = slugify(title);
  const taken = new Set(
    (await prisma.academyTest.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((t) => t.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
