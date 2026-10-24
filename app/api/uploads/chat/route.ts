import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { verifyToken } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { CHAT_DIR, typeForExt } from "./storage";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getAnyUser(): Promise<boolean> {
  const cookieStore = await cookies();

  // Try admin_token (admin, manager, picker)
  const adminToken = cookieStore.get("admin_token")?.value;
  if (adminToken) {
    try {
      const { payload } = await jwtVerify(adminToken, getSecret());
      const role = payload.role as string;
      if (["admin", "manager", "picker"].includes(role)) return true;
    } catch {}
  }

  // Try auth_token (customer — site and mobile app)
  const authToken = cookieStore.get("auth_token")?.value;
  if (authToken) {
    const payload = await verifyToken(authToken);
    if (payload?.id) return true;
  }

  return false;
}

const MB = 1024 * 1024;
const LIMIT = { img: 15 * MB, video: 100 * MB, file: 25 * MB } as const;

/**
 * Chat attachment upload: photo, video or document. Saved to data/chat (outside the build —
 * survives redeploys) and served by /api/uploads/chat/[name].
 */
export async function POST(request: Request) {
  const ok = await getAnyUser();
  if (!ok) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = typeForExt(ext);
  if (!t) {
    return NextResponse.json(
      { error: "Такой файл нельзя отправить. Можно фото, видео, PDF, документы Word/Excel, архивы." },
      { status: 400 }
    );
  }
  if (file.size > LIMIT[t.kind]) {
    return NextResponse.json({ error: `Файл слишком большой (макс. ${LIMIT[t.kind] / MB} МБ)` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(CHAT_DIR, { recursive: true });
  const filename = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await writeFile(path.join(CHAT_DIR, filename), buffer);

  const name = (file.name || filename).slice(0, 120);
  return NextResponse.json({ url: `/api/uploads/chat/${filename}`, kind: t.kind, name, size: file.size, mime: t.mime });
}
