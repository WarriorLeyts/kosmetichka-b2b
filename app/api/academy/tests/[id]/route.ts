import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaffEditor } from "@/lib/academy";
import { questionsCreate, readDraft } from "../save";

type Ctx = { params: Promise<{ id: string }> };

async function testId(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Сохранить тест: вопросы заменяются целиком. Уже пройденные попытки не меняются —
 * в них хранится снимок вопросов на момент прохождения.
 */
export async function PUT(request: Request, ctx: Ctx) {
  if (!(await requireStaffEditor())) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const id = await testId(ctx);
  if (!id || !(await prisma.academyTest.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Тест не найден" }, { status: 404 });
  }
  const r = await readDraft(request);
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  const d = r.data;

  await prisma.$transaction([
    prisma.academyQuestion.deleteMany({ where: { testId: id } }),
    prisma.academyTest.update({
      where: { id },
      data: {
        title: d.title,
        description: d.description,
        passScore: d.passScore,
        timeLimitMin: d.timeLimitMin,
        isPublished: d.isPublished,
        questions: { create: questionsCreate(d) },
      },
    }),
  ]);
  return NextResponse.json({ ok: true, id });
}

/** Удалить можно только тест без прохождений — иначе пропадут результаты сотрудников. */
export async function DELETE(_request: Request, ctx: Ctx) {
  if (!(await requireStaffEditor())) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const id = await testId(ctx);
  const test = id
    ? await prisma.academyTest.findUnique({ where: { id }, select: { _count: { select: { attempts: true } } } })
    : null;
  if (!id || !test) return NextResponse.json({ error: "Тест не найден" }, { status: 404 });
  if (test._count.attempts > 0) {
    return NextResponse.json(
      { error: "Тест уже проходили — удалить нельзя, чтобы не потерять результаты. Снимите галочку «Опубликован», и сотрудники его не увидят." },
      { status: 409 },
    );
  }
  // attempts: none — на случай, если кто-то сдал тест прямо сейчас
  const { count } = await prisma.academyTest.deleteMany({ where: { id, attempts: { none: {} } } });
  if (!count) return NextResponse.json({ error: "Тест только что прошли — удалить нельзя, снимите публикацию" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
