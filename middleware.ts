import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  const isDeployed =
    process.env.NODE_ENV === "production" || !!process.env.NEXT_PUBLIC_SITE_URL;

  if (isDeployed) {
    throw new Error(
      "JWT_SECRET is not set. Add JWT_SECRET to your environment variables before deploying."
    );
  }

  console.warn(
    "[middleware] JWT_SECRET is not set in .env — using a dev-only fallback. Set JWT_SECRET before deploying to production."
  );

  return "dev-secret-kosmetichka-change-in-production";
}

const secret = new TextEncoder().encode(resolveJwtSecret());

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // --- Admin API routes: require admin or manager role, return JSON 401 ---
  if (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/login") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== "admin" && payload.role !== "manager") {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
  }

  // --- Admin routes: require admin or manager role ---
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);

      if (payload.role !== "admin" && payload.role !== "manager") {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // --- Picker routes: require picker, manager, or admin role ---
  if (pathname.startsWith("/picker") && pathname !== "/picker/login") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/picker/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      if (!["admin", "manager", "picker"].includes(role)) {
        return NextResponse.redirect(new URL("/picker/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/picker/login", request.url));
    }
  }

  // --- Staff tests (/academy, test.kosmetichka-opt.ru): any staff account ---
  if (pathname.startsWith("/academy") && pathname !== "/academy/login") {
    const token = request.cookies.get("admin_token")?.value;
    // Внешний адрес берём из заголовков nginx: сам Next за прокси знает только 127.0.0.1
    const toLogin = () => {
      const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
      let url: URL;
      try {
        url = new URL("/academy/login", host ? `${proto}://${host}` : request.url);
      } catch {
        url = new URL("/academy/login", request.url); // кривой Host — не падаем
      }
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    };
    if (!token) return toLogin();
    try {
      await jwtVerify(token, secret);
    } catch {
      return toLogin();
    }
  }

  // --- Customer routes: require auth_token ---
  // /catalog is intentionally public — guests can browse with retail prices
  const customerRoutes = ["/orders", "/profile", "/wishlist"];
  const isCustomerRoute = customerRoutes.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );

  if (isCustomerRoute) {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      await jwtVerify(token, secret);
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/admin/:path*",
    "/picker/:path*",
    "/academy",
    "/academy/:path*",
    "/orders/:path*",
    "/orders",
    "/profile",
    "/wishlist",
    "/wishlist/:path*",
  ],
};
