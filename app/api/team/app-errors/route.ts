import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY, requireStaff } from "../_auth";

// GET /api/team/app-errors — errors and crashes reported by both apps, last 30 days (admin only, as on the site)
export async function GET() {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  const since = new Date(Date.now() - 30 * 24 * 3600e3);
  const rows = await prisma.appError.findMany({ where: { lastAt: { gte: since } }, orderBy: { lastAt: "desc" }, take: 200 });
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      app: r.app,
      platform: r.platform,
      fatal: r.fatal,
      message: r.message,
      stack: r.stack,
      screen: r.screen,
      version: r.version,
      count: r.count,
      customers: r.customers.length,
      firstAt: r.firstAt.toISOString(),
      lastAt: r.lastAt.toISOString(),
    })),
  });
}
