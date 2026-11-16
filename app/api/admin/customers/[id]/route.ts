import path from "path";
import { unlink } from "fs/promises";
import { PROOF_DIR } from "@/lib/proofs";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAdminRole } from "@/lib/auth";
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
  // managers only view customers: approving and editing is for the admin
  if (!(await requireAdminRole())) return NextResponse.json({ error: "Только администратор может подтверждать и изменять клиентов" }, { status: 403 });

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
  // the retail price in the app's product card for a wholesale customer (admin only, as this whole route)
  if (body.showRetailPrice !== undefined) data.showRetailPrice = !!body.showRetailPrice;
  if (body.isApproved !== undefined) data.isApproved = !!body.isApproved;

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (password) {
    if (password.length < 6) return NextResponse.json({ error: "Пароль — не короче 6 символов" }, { status: 400 });
    data.password = await bcrypt.hash(password, 10);
    data.passwordChangedAt = new Date(); // the customer's old sessions end
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


/** Delete only accounts without orders. 1C and MAXMA records are not modified. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const admin = await requireAdminRole();
  if (!admin) return NextResponse.json({ error: "Удалять клиентов может только администратор" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  const hasOrders = () => NextResponse.json({ error: "У клиента есть заказы. Удаление невозможно — заблокируйте клиента.", code: "customer_has_orders" }, { status: 409 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id },
        select: { proofs: { select: { file: true } }, _count: { select: { orders: true } } },
      });
      if (!customer) return { status: "missing" as const };
      if (customer._count.orders) return { status: "orders" as const };
      // Recheck at deletion time; the Order foreign key also protects against concurrent checkout.
      const deleted = await tx.customer.deleteMany({ where: { id, orders: { none: {} } } });
      if (!deleted.count) return { status: "orders" as const };
      await tx.adminAuditLog.create({ data: {
        userId: Number(admin.id), userName: String(admin.email ?? "admin"),
        action: "delete", entity: "customer", entityId: String(id), summary: `Удалён клиент №${id} без заказов`,
      } });
      return { status: "deleted" as const, proofs: customer.proofs };
    });
    if (result.status === "missing") return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    if (result.status === "orders") return hasOrders();
    // Rows are cascaded by the database; remove uploaded proof files only after commit.
    await Promise.all(result.proofs.map(async ({ file }) => {
      if (path.basename(file) !== file) return;
      try { await unlink(path.join(PROOF_DIR, file)); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[customer-delete] Could not remove proof file"); }
    }));
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2003") return hasOrders();
    throw e;
  }
}
