import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start with an insecure default."
    );
  }

  console.warn(
    "[middleware] JWT_SECRET is not set in .env — using a fixed dev-only secret. Set JWT_SECRET before deploying to production."
  );

  return "dev-secret-kosmetichka-change-in-production";
}

const secret = new TextEncoder().encode(resolveJwtSecret());

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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

  // --- Customer routes: require auth_token ---
  // /catalog is intentionally public — guests can browse with retail prices
  const customerRoutes = ["/orders", "/profile"];
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
  matcher: ["/admin/:path*", "/picker/:path*", "/orders/:path*", "/orders", "/profile"],
};
