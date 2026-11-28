import { verifyCustomerToken } from "@/lib/customerAuth";
import { verifyToken } from "@/lib/auth";

type CookieReader = { get(name: string): { value: string } | undefined };
const staffRole = (role: unknown) => ["admin", "manager", "picker"].includes(String(role ?? ""));

/** Team and the shop can be signed in simultaneously in one browser. The marker only chooses
 * between existing verified sessions; it never grants staff rights on its own. */
export async function catalogViewer(request: Request, cookies: CookieReader) {
  const adminToken = cookies.get("admin_token")?.value;
  if (request.headers.get("x-kosmetichka-client") === "team" && adminToken) {
    const staff = await verifyToken(adminToken);
    if (staffRole(staff?.role)) return { customer: null, staff };
  }
  const customerToken = cookies.get("auth_token")?.value;
  const customer = customerToken ? await verifyCustomerToken(customerToken) : null;
  if (customer?.id) return { customer, staff: null };
  const candidate = adminToken ? await verifyToken(adminToken) : null;
  return { customer: null, staff: staffRole(candidate?.role) ? candidate : null };
}
