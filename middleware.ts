import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start with an insecure default."
    );
  }

  // Dev convenience only — see lib/auth.ts for why this doesn't throw here.
  console.warn(
    "[middleware] JWT_SECRET is not set in .env — using a temporary random secret for this dev session."
  );

  return `dev-only-${Math.random().toString(36).slice(2)}${Date.now()}`;
}

const secret = new TextEncoder().encode(resolveJwtSecret());

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login"
  ) {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
    }

    try {
      const { payload } = await jwtVerify(token, secret);

      if (
        payload.role !== "admin" &&
        payload.role !== "manager"
      ) {
        return NextResponse.redirect(
          new URL("/admin/login", request.url)
        );
      }
    } catch {
      return NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};