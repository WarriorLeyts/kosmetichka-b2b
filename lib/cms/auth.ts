import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rateLimit";

/**
 * Admin panel (admin.kosmetichka-opt.ru): who may do what. Checked on the server in every
 * page (requireCmsPage) and every API handler (cmsGuard) — the menu only hides what is not allowed.
 */
export const PERMISSIONS = {
  "cms.access": ["admin", "manager"],
  "home.edit": ["admin", "manager"],
  "home.publish": ["admin"],
  "banners.edit": ["admin", "manager"],
  "banners.delete": ["admin"],
  "products.edit": ["admin", "manager"],
  "products.photos": ["admin", "manager"],
  "audit.view": ["admin"],
} as const satisfies Record<string, readonly string[]>;

export type Permission = keyof typeof PERMISSIONS;

export type CmsUser = { id: number; name: string; login: string; role: string };

export function can(user: Pick<CmsUser, "role"> | null | undefined, perm: Permission): boolean {
  return !!user && (PERMISSIONS[perm] as readonly string[]).includes(user.role);
}

/** The signed-in staff member of the admin panel, or null (no cookie, expired, deleted, wrong role). */
export async function getCmsUser(): Promise<CmsUser | null> {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || typeof payload.role !== "string" || !can({ role: payload.role }, "cms.access")) return null;
  const user = await prisma.user.findUnique({ where: { id: Number(payload.id) }, select: { id: true, name: true, login: true, role: true } });
  return user && can(user, "cms.access") ? user : null;
}

/**
 * For API handlers: the user if signed in and allowed `perm`, otherwise a ready JSON error.
 * Changing requests must come from the admin panel itself (Origin check against CSRF).
 */
export async function cmsGuard(request: Request, perm: Permission): Promise<{ user: CmsUser; ip: string } | NextResponse> {
  // the panel's API answers only on its own host (proxy.ts doesn't see /api/cms: big uploads must not pass through it)
  const reqHost = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const cmsHost = (process.env.CMS_HOST || "admin.kosmetichka-opt.ru").toLowerCase();
  if (reqHost !== cmsHost && reqHost !== "admin.localhost") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      let ok = false;
      try {
        // по имени хоста (порт не важен: за nginx Host приходит без него)
        ok = new URL(origin).hostname === host.split(":")[0];
      } catch {
        ok = false;
      }
      if (!ok) return NextResponse.json({ error: "Запрос не из админ-панели" }, { status: 403 });
    }
  }
  const user = await getCmsUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!can(user, perm)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  return { user, ip: getClientIp(request) };
}

export function isGuardError(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
