import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY, requireStaff } from "../../_auth";
import { STORY_PREFIX, readStory, storySchema } from "@/lib/stories";
import { storyFilesExist } from "@/lib/storyMedia";

const identity = z.object({ updatedAt: z.string().datetime() });
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_ONLY); if (!auth.ok) return auth.response;
  const { id } = await params; if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: "Сторис не найдена" }, { status: 404 });
  const body = await request.json().catch(() => null), r = storySchema.safeParse(body), version = identity.safeParse(body);
  if (!r.success || !version.success) return NextResponse.json({ error: !r.success ? r.error.issues[0]?.message : "Обновите страницу и повторите" }, { status: 400 });
  if (r.data.published && r.data.expiresAt && Date.parse(r.data.expiresAt) <= Date.now()) return NextResponse.json({ error: "Выберите новый срок показа" }, { status: 400 });
  if (!(await storyFilesExist([r.data.mediaUrl, r.data.coverUrl]))) return NextResponse.json({ error: "Файл не найден. Загрузите его ещё раз." }, { status: 400 });
  const changed = await prisma.cmsSetting.updateMany({ where: { key: STORY_PREFIX + id, updatedAt: new Date(version.data.updatedAt) }, data: { value: r.data, updatedBy: String(auth.session.id) } });
  if (!changed.count) return NextResponse.json({ error: "Сторис уже изменилась. Обновите список и проверьте изменения." }, { status: 409 });
  const row = await prisma.cmsSetting.findUnique({ where: { key: STORY_PREFIX + id } });
  return NextResponse.json({ item: row ? readStory(row) : null });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_ONLY); if (!auth.ok) return auth.response;
  const { id } = await params, version = identity.safeParse(await request.json().catch(() => null));
  if (!/^[a-f0-9]{32}$/.test(id) || !version.success) return NextResponse.json({ error: "Обновите список и повторите" }, { status: 400 });
  const changed = await prisma.cmsSetting.deleteMany({ where: { key: STORY_PREFIX + id, updatedAt: new Date(version.data.updatedAt) } });
  return changed.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Сторис уже изменилась. Обновите список." }, { status: 409 });
}
