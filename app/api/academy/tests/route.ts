import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaffEditor } from "@/lib/academy";
import { freeSlug, questionsCreate, readDraft } from "./save";

/** Новый тест из редактора (HR и администратор). */
export async function POST(request: Request) {
  if (!(await requireStaffEditor())) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const r = await readDraft(request);
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  const d = r.data;

  const last = await prisma.academyTest.aggregate({ _max: { sortOrder: true } });
  const test = await prisma.academyTest.create({
    data: {
      slug: await freeSlug(d.title),
      title: d.title,
      description: d.description,
      passScore: d.passScore,
      timeLimitMin: d.timeLimitMin,
      isPublished: d.isPublished,
      showAnswers: false,
      shuffle: true,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      questions: { create: questionsCreate(d) },
    },
    select: { id: true, slug: true },
  });
  return NextResponse.json({ ok: true, ...test });
}
