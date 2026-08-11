import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      name: true,
      barcode: true,
      article: true,
      guid: true,
      images: { select: { id: true, path: true } },
    },
  });

  if (!product) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  return NextResponse.json({ product });
}
