import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

/** Returns the logged-in customer id from the auth_token cookie, or null. */
export async function currentCustomerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.id ? Number(payload.id) : null;
}
