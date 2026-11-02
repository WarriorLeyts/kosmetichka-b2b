import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { CHAT_DIR, typeForExt } from "./storage";

/** staff → "staff"; a signed-in customer → his id; nobody → null */
async function getAnyUser(): Promise<"staff" | number | null> {
  const cookieStore = await cookies();

  // Try admin_token (admin, manager, picker)
  const adminToken = cookieStore.get("admin_token")?.value;
  if (adminToken) {
    const payload = await verifyToken(adminToken);
    const role = payload?.role as string | undefined;
    if (role && ["admin", "manager", "picker"].includes(role)) return "staff";
  }

  // Try auth_token (customer — site and mobile app)
  const authToken = cookieStore.get("auth_token")?.value;
  if (authToken) {
    const payload = await verifyCustomerToken(authToken);
    if (payload?.id) return Number(payload.id);
  }

  return null;
}

const MB = 1024 * 1024;
const LIMIT = { img: 15 * MB, video: 50 * MB, file: 25 * MB } as const;
/** a customer uploads at most this much a day (audit P2-06: the server disk must not fill up); staff — no quota */
const CUSTOMER_DAY = 300 * MB;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds `size` bytes to the customer's 24-hour upload total; false when it would pass CUSTOMER_DAY. */
async function takeQuota(customerId: number, size: number): Promise<boolean> {
  const key = `chat_upload_c${customerId}`;
  const now = new Date();
  const row = await prisma.loginAttempt.findUnique({ where: { ip: key } });
  if (row && row.resetAt > now) {
    if (row.count + size > CUSTOMER_DAY) return false;
    await prisma.loginAttempt.update({ where: { ip: key }, data: { count: { increment: size } } });
    return true;
  }
  await prisma.loginAttempt.upsert({
    where: { ip: key },
    update: { count: size, resetAt: new Date(now.getTime() + DAY_MS) },
    create: { ip: key, count: size, resetAt: new Date(now.getTime() + DAY_MS) },
  });
  return true;
}

/**
 * Chat attachment upload: photo, video or document. Saved to data/chat (outside the build —
 * survives redeploys) and served by /api/uploads/chat/[name].
 */
export async function POST(request: Request) {
  const who = await getAnyUser();
  if (who === null) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

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
  if (who !== "staff" && !(await takeQuota(who, file.size))) {
    return NextResponse.json({ error: "Лимит загрузок на сегодня исчерпан (300 МБ в сутки). Попробуйте завтра." }, { status: 429 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(CHAT_DIR, { recursive: true });
  const filename = `chat-${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.join(CHAT_DIR, filename), buffer);

  const name = (file.name || filename).slice(0, 120);
  return NextResponse.json({ url: `/api/uploads/chat/${filename}`, kind: t.kind, name, size: file.size, mime: t.mime });
}
