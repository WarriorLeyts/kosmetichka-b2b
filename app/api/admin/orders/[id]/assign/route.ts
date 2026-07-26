import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

// POST /api/admin/orders/[id]/assign
// Body: { pickerId: number | null }
export async function POST(request: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const body = await request.json();
  const pickerId: number | null = body.pickerId ?? null;

  // Validate picker exists and has picker role
  if (pickerId !== null) {
    const picker = await prisma.user.findUnique({ where: { id: pickerId } });
    if (!picker || picker.role !== "picker") {
      return NextResponse.json({ error: "Сборщик не найден" }, { status: 404 });
    }
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { pickerId },
    select: { id: true, pickerId: true, picker: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ order });
}
