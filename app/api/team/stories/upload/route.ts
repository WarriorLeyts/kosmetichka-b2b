import { NextResponse } from "next/server";
import { ADMIN_ONLY, requireStaff } from "../../_auth";
import { saveStoryMedia, StoryMediaError } from "@/lib/storyMedia";

export async function POST(request: Request) {
  const auth = await requireStaff(ADMIN_ONLY); if (!auth.ok) return auth.response;
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Выберите фото или видео" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Файл больше 50 МБ" }, { status: 400 });
    return NextResponse.json(await saveStoryMedia(Buffer.from(await file.arrayBuffer())));
  } catch (e) {
    if (e instanceof StoryMediaError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
