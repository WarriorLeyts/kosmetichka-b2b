import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { AppBar } from "@/components/app/AppBar";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

/** «Уведомления» — the same feed as in the app: orders, manager messages, bonuses, back in stock, promo. */
export default async function NotificationsPage() {
  const token = (await cookies()).get("auth_token")?.value;
  const payload = token ? await verifyCustomerToken(token) : null;
  if (!payload?.id) redirect("/login");

  return (
    <main className="min-h-screen bg-slate-50 app-page">
      <AppBar backHref="/catalog" />
      <div className="mx-auto max-w-2xl">
        <NotificationsClient />
      </div>
    </main>
  );
}
