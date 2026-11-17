import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, saveImageWithOriginal, UploadError } from "@/lib/cms/upload";

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

  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
  let saved: Awaited<ReturnType<typeof saveImageWithOriginal>>;
  try {
    saved = await saveImageWithOriginal(Buffer.from(await file.arrayBuffer()), "products", 2000);
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const relPath = saved.path;

  // Delete old images and create new one
  await prisma.productImage.deleteMany({ where: { productId } });
  const image = await prisma.productImage.create({
    data: { productId, path: relPath, original: saved.original },
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
