import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start with an insecure default."
    );
  }

  // Dev convenience only: a top-level throw here is re-evaluated by the
  // bundler on every recompile and can spin the dev server into a crash
  // loop instead of just failing once. Warn loudly and keep going with a
  // random secret instead (sessions just won't survive a restart).
  console.warn(
    "[auth] JWT_SECRET is not set in .env — using a temporary random secret for this dev session. Set JWT_SECRET before deploying to production."
  );

  return `dev-only-${Math.random().toString(36).slice(2)}${Date.now()}`;
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
    .setExpirationTime("30d")
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