import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { assortmentSchema, getAssortment, saveAssortment } from "@/lib/assortment";

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
export async function GET(_req: NextRequest, { params }: Props) {
  if (!(await getUser())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Некорректный товар" }, { status: 400 });
  const result = await getAssortment(id);
  return NextResponse.json(result ?? { error: "Товар не найден" }, { status: result ? 200 : 404 });
}
export async function PUT(req: NextRequest, { params }: Props) {
  if (!(await getUser())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const id = Number((await params).id);
  const parsed = assortmentSchema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) return NextResponse.json({ error: parsed.success ? "Некорректный товар" : parsed.error.issues[0].message }, { status: 400 });
  try { return NextResponse.json(await saveAssortment(id, parsed.data)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить" }, { status: 400 }); }
}
