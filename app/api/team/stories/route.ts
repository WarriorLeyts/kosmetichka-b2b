import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY, requireStaff } from "../_auth";
import { STORY_PREFIX, readStory, storySchema } from "@/lib/stories";
import { storyFilesExist } from "@/lib/storyMedia";

export async function GET() {
  const auth = await requireStaff(ADMIN_ONLY); if (!auth.ok) return auth.response;
  const rows = await prisma.cmsSetting.findMany({ where: { key: { startsWith: STORY_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 1000 });
  return NextResponse.json({ items: rows.flatMap(r => { const s = readStory(r); return s ? [s] : []; }).sort((a, b) => a.position - b.position || b.updatedAt.localeCompare(a.updatedAt)) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const auth = await requireStaff(ADMIN_ONLY); if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const r = storySchema.safeParse(body);
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message || "Проверьте данные" }, { status: 400 });
  if (r.data.published && r.data.expiresAt && Date.parse(r.data.expiresAt) <= Date.now()) return NextResponse.json({ error: "Выберите новый срок показа" }, { status: 400 });
  if (!(await storyFilesExist([r.data.mediaUrl, r.data.coverUrl]))) return NextResponse.json({ error: "Файл не найден. Загрузите его ещё раз." }, { status: 400 });
  // Retry after a lost response must not create a second publication.
  const id = typeof body?.requestId === "string" && /^[a-f0-9]{32}$/.test(body.requestId) ? body.requestId : randomBytes(16).toString("hex");
  const key = STORY_PREFIX + id;
  const existing = await prisma.cmsSetting.findUnique({ where: { key } });
  if (existing) return NextResponse.json({ item: readStory(existing), alreadySaved: true });
  try {
    const row = await prisma.cmsSetting.create({ data: { key, value: r.data, updatedBy: String(auth.session.id) } });
    return NextResponse.json({ item: readStory(row) }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const row = await prisma.cmsSetting.findUnique({ where: { key } });
    return NextResponse.json({ item: row ? readStory(row) : null, alreadySaved: true });
  }
}
