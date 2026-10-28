import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isWholesaleRole, maxAccess } from "@/lib/roles";

const PRICE_TYPES = ["retail", "discount", "wholesale", "big_wholesale"];
const TEXT_FIELDS = ["name", "companyName", "phone", "email", "inn", "city", "address"] as const;

/**
 * PUT /api/admin/customers/:id — edit a customer (admin / manager), the same fields as the old
 * admin form: contacts, price type, access to wholesale prices, active / blocked, approved,
 * 1C manager and id, a new password. Only the fields sent are changed.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный id" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Пустой запрос" }, { status: 400 });

  const current = await prisma.customer.findUnique({ where: { id }, select: { priceType: true, wholesaleAccess: true } });
  if (!current) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const data: Prisma.CustomerUpdateInput = {};
  for (const f of TEXT_FIELDS) {
    if (body[f] === undefined) continue;
    const v = String(body[f] ?? "").trim();
    // phone is unique: empty → null, not ""
    (data as Record<string, unknown>)[f] = f === "phone" ? v || null : v;
  }
  if (body.manager !== undefined) data.manager = String(body.manager ?? "").trim() || null;
  if (body.oneCId !== undefined) data.oneCId = String(body.oneCId ?? "").trim() || null;

  let priceType = current.priceType;
  if (body.priceType !== undefined) {
    if (!PRICE_TYPES.includes(String(body.priceType))) return NextResponse.json({ error: "Неизвестный тип цен" }, { status: 400 });
    priceType = String(body.priceType);
    data.priceType = priceType;
  }
  if (body.wholesaleAccess !== undefined || body.priceType !== undefined) {
    const raw = body.wholesaleAccess !== undefined ? String(body.wholesaleAccess ?? "") : current.wholesaleAccess ?? "";
    // a wholesale price type always implies at least that access
    data.wholesaleAccess = maxAccess(isWholesaleRole(raw) ? raw : null, priceType);
  }
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.isApproved !== undefined) data.isApproved = !!body.isApproved;

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (password) {
    if (password.length < 6) return NextResponse.json({ error: "Пароль — не короче 6 символов" }, { status: 400 });
    data.password = await bcrypt.hash(password, 10);
  }

  try {
    await prisma.customer.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Этот телефон уже указан у другого клиента" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ success: true });
}
