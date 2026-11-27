import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STORY_PREFIX, activeStories, readStory } from "@/lib/stories";

export const dynamic = "force-dynamic";
export async function GET() {
  const rows = await prisma.cmsSetting.findMany({ where: { key: { startsWith: STORY_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 1000 });
  const items = activeStories(rows.flatMap(r => { const s = readStory(r); return s ? [s] : []; }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
