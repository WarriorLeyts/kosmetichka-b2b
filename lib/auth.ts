import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Consider the app "deployed" if either NODE_ENV=production OR
  // NEXT_PUBLIC_SITE_URL is set (it's always configured on Amvera/staging).
  // This catches the case where NODE_ENV is accidentally left as "development"
  // on a real server.
  const isDeployed =
    process.env.NODE_ENV === "production" || !!process.env.NEXT_PUBLIC_SITE_URL;

  if (isDeployed) {
    throw new Error(
      "JWT_SECRET is not set. Add JWT_SECRET to your environment variables before deploying."
    );
  }

  // Dev convenience only: a top-level throw here is re-evaluated by the
  // bundler on every recompile and can spin the dev server into a crash
  // loop instead of just failing once. Warn loudly and keep going.
  console.warn(
    "[auth] JWT_SECRET is not set in .env — using a dev-only fallback. Set JWT_SECRET before deploying to production."
  );

  return "dev-secret-kosmetichka-change-in-production";
}

const secret = new TextEncoder().encode(resolveJwtSecret());

export async function createToken(payload: {
  id: number;
  email: string;
  role: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifies the admin/manager session cookie for use inside API route
 * handlers (middleware.ts only protects /admin/* pages, not /api/admin/*
 * routes, so every admin API route must call this itself).
 */
export async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);

  if (!payload || (payload.role !== "admin" && payload.role !== "manager")) {
    return null;
  }

  return payload;
}