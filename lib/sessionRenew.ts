import { cookies } from "next/headers";
import { createToken } from "@/lib/auth";

/**
 * Sliding sessions (audit BUG-02): a login token lives 7 days while its cookie lives 30, so an
 * active customer / employee was signed out every week. The apps ask «who am I» on every start
 * (/api/auth/me, /api/team/me): a token older than a day is re-issued there, so whoever uses the app
 * at least once a week stays signed in; a week away still means signing in again.
 */
export const RENEW_AFTER_SEC = 24 * 60 * 60;

export function needsRenewal(iat: number | undefined, nowSec = Math.floor(Date.now() / 1000)) {
  return typeof iat === "number" && nowSec - iat > RENEW_AFTER_SEC;
}

export async function renewSession(cookie: "auth_token" | "admin_token", claims: { id: number; email: string; role: string }) {
  const token = await createToken(claims);
  (await cookies()).set(cookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
