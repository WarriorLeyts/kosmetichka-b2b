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
    "[middleware] JWT_SECRET is not set in .env — using a temporary random secret for this dev session."
  );

  return `dev-only-${Math.random().toString(36).slice(2)}${Date.now()}`;
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/picker/:path*"],
};
