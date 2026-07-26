import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { verifyToken } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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

  // Try auth_token (customer)
  const authToken = cookieStore.get("auth_token")?.value;
  if (authToken) {
    const payload = await verifyToken(authToken);
    if (payload?.id) return true;
  }

  return false;
}

export async function POST(request: Request) {
  const ok = await getAnyUser();
  if (!ok) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Только изображения" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Файл слишком большой (макс. 10MB)" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(process.cwd(), "public", "uploads", "chat");
  await mkdir(uploadDir, { recursive: true });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  await writeFile(filepath, buffer);

  return NextResponse.json({ url: `/uploads/chat/${filename}` });
}
