import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

function getSecret() {
  const secret = process.env.JWT_SECRET || "dev-fallback";
  return new TextEncoder().encode(secret);
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager", "picker"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const orderItemId = Number(formData.get("orderItemId"));

  if (!file || !orderItemId) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Save to public/uploads/order-photos/
  const uploadDir = path.join(process.cwd(), "public", "uploads", "order-photos");
  await mkdir(uploadDir, { recursive: true });

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${orderItemId}-${Date.now()}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  await writeFile(filepath, buffer);

  const url = `/uploads/order-photos/${filename}`;

  const photo = await prisma.orderItemPhoto.create({
    data: { orderItemId, url },
  });

  return NextResponse.json({ photo });
}
