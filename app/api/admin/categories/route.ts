import { NextResponse } from "next/server";
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

// GET /api/admin/categories
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, guid: true, name: true, parentGuid: true },
  });

  return NextResponse.json({ categories });
}
