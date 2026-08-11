import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth guard
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload?.id || !["admin", "manager"].includes(payload.role as string)) {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  }

  const { id } = await params;
  const productId = Number(id);
  if (!productId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Недопустимый тип файла" }, { status: 400 });
  }

  // Save to data/1c/uploads/products/
  const uploadDir = path.join(process.cwd(), "data", "1c", "uploads", "products");
  fs.mkdirSync(uploadDir, { recursive: true });

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filename = `${productId}_${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const relPath = `uploads/products/${filename}`;

  // Delete old images and create new one
  await prisma.productImage.deleteMany({ where: { productId } });
  const image = await prisma.productImage.create({
    data: { productId, path: relPath },
  });

  return NextResponse.json({ success: true, path: relPath, id: image.id });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload?.id || !["admin", "manager"].includes(payload.role as string)) {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  }

  const { id } = await params;
  const productId = Number(id);

  await prisma.productImage.deleteMany({ where: { productId } });
  return NextResponse.json({ success: true });
}
