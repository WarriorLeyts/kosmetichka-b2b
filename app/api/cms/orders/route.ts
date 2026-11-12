import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { orderScopeWhere, staffScope } from "@/lib/staffScope";
import { orderIdFromQuery, syncState, syncWhere } from "@/lib/cms/orderSync";

export const dynamic = "force-dynamic";

const SORTS: Record<string, (d: Prisma.SortOrder) => Prisma.OrderOrderByWithRelationInput[]> = {
  date: (d) => [{ createdAt: d }],
  total: (d) => [{ total: d }],
  id: (d) => [{ id: d }],
};

// GET /api/cms/orders — заказы: поиск, коммерческий статус, статус обмена с 1С, период; страницы на сервере.
// Менеджер видит только заказы своих клиентов (lib/staffScope.ts), как в Team.
export async function GET(request: Request) {
  const g = await cmsGuard(request, "orders.view");
  if (isGuardError(g)) return g;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(10, Number(sp.get("limit")) || 50));
  const and: Prisma.OrderWhereInput[] = [orderScopeWhere(await staffScope(g.user))];

  const q = (sp.get("search") ?? "").trim().slice(0, 100);
  if (q) {
    const id = orderIdFromQuery(q);
    // телефоны хранятся как 7XXXXXXXXXX: «8 967 955…» и «+7 967 955…» ищем без первой цифры
    let digits = q.replace(/\D/g, "");
    if (digits.length >= 7 && /^[78]/.test(digits)) digits = digits.slice(1);
    and.push({
      OR: [
        ...(id ? [{ id }] : []),
        { oneCNumber: { contains: q, mode: "insensitive" } },
        { oneCStockNumber: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
        ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits.slice(-10) } } }] : []),
      ],
    });
  }
  const status = sp.get("status");
  if (status) and.push({ status });
  const sync = sp.get("sync");
  if (sync) and.push(syncWhere(sync));
  const from = sp.get("from");
  const to = sp.get("to");
  // даты из фильтра — московские сутки
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) and.push({ createdAt: { gte: new Date(`${from}T00:00:00+03:00`) } });
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) and.push({ createdAt: { lt: new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000) } });
  const where: Prisma.OrderWhereInput = { AND: and };

  const sortKey = SORTS[sp.get("sort") ?? ""] ? (sp.get("sort") as string) : "date";
  const dir: Prisma.SortOrder = sp.get("dir") === "asc" ? "asc" : "desc";

  const [rows, total, unsynced] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [...SORTS[sortKey](dir), { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        priceType: true,
        oneCExportedAt: true,
        oneCNumber: true,
        oneCStockNumber: true,
        oneCError: true,
        oneCNextTryAt: true,
        oneCSendingAt: true,
        customer: { select: { id: true, name: true, companyName: true, phone: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { AND: [and[0], syncWhere("unsynced")] } }),
  ]);
  const ids = rows.map((r) => r.id);
  const last = ids.length
    ? await prisma.oneCOrderAttempt.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _max: { at: true }, _count: { _all: true } })
    : [];
  const lastBy = new Map(last.map((l) => [l.orderId, { at: l._max.at, n: l._count._all }]));
  const now = new Date();

  return NextResponse.json({
    total,
    page,
    limit,
    unsynced,
    items: rows.map((r) => {
      const state = syncState(r, now);
      return {
        id: r.id,
        status: r.status,
        total: r.total,
        createdAt: r.createdAt,
        lines: r._count.items,
        customer: r.customer ? { id: r.customer.id, name: r.customer.companyName || r.customer.name || "Без имени", phone: r.customer.phone } : null,
        sync: state,
        oneCNumber: [r.oneCNumber, r.oneCStockNumber].filter(Boolean).join(", ") || null,
        // ошибка интересна, пока документ не создан
        error: state === "synced" ? null : r.oneCError,
        nextTryAt: state === "failed" || state === "pending" ? r.oneCNextTryAt : null,
        // последняя попытка: из журнала; у заказов до журнала — время выгрузки
        lastTryAt: lastBy.get(r.id)?.at ?? r.oneCExportedAt ?? null,
        attempts: lastBy.get(r.id)?.n ?? 0,
      };
    }),
  });
}
